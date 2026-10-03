import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  getPackageAvailability,
  getScheduleBlockConflicts,
} from "@/modules/scheduling/availability-service";
import {
  addCalendarDays,
  localDateTimeToUtc,
  getLocalDate,
  weekdayForLocalDate,
} from "@/modules/scheduling/time";

const token = randomUUID();
const now = new Date();
const date = addCalendarDays(getLocalDate(now, env.STUDIO_TIMEZONE), 3);
const weekday = weekdayForLocalDate(date);

let userId: string;
let packageId: string;
let originalHours: {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
} | null;
const bookingIds: string[] = [];
const blockIds: string[] = [];

const at = (time: string) =>
  localDateTimeToUtc(`${date}T${time}`, env.STUDIO_TIMEZONE);

describe("availability and schedule blocks against PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const existingHours = await prisma.operatingHour.findUnique({
      where: { weekday },
    });
    originalHours = existingHours
      ? {
          isOpen: existingHours.isOpen,
          openTime: existingHours.openTime,
          closeTime: existingHours.closeTime,
        }
      : null;
    await prisma.operatingHour.upsert({
      where: { weekday },
      create: { weekday, isOpen: true, openTime: "09:00", closeTime: "14:00" },
      update: { isOpen: true, openTime: "09:00", closeTime: "14:00" },
    });

    const user = await prisma.user.create({
      data: {
        googleSub: `scheduling-${token}`,
        email: `schedule-${token}@example.test`,
        name: "Scheduling Fixture",
      },
    });
    userId = user.id;

    const photoPackage = await prisma.package.create({
      data: {
        slug: `scheduling-${token}`,
        name: "Scheduling Fixture Package",
        description: "Integration fixture",
        price: 100_000,
        durationMinutes: 10,
        bufferMinutes: 2,
      },
    });
    packageId = photoPackage.id;

    for (const [codeSuffix, start, end, status, holdExpiresAt] of [
      ["confirmed", "09:00", "10:00", "CONFIRMED", null],
      ["confirmed-near-block", "11:30", "12:30", "CONFIRMED", null],
      [
        "active-hold",
        "12:30",
        "13:30",
        "WAITING_PAYMENT",
        new Date(now.getTime() + 60_000),
      ],
    ] as const) {
      const booking = await prisma.booking.create({
        data: {
          code: `schedule-${token}-${codeSuffix}`,
          userId,
          packageId,
          packageNameSnapshot: photoPackage.name,
          priceSnapshot: photoPackage.price,
          startAt: at(start),
          endAt: at(end),
          status,
          holdExpiresAt,
        },
      });
      bookingIds.push(booking.id);
    }

    const block = await prisma.scheduleBlock.create({
      data: {
        startAt: at("11:30"),
        endAt: at("12:00"),
        reason: "Conflict warning fixture",
      },
    });
    blockIds.push(block.id);
    const availabilityBlock = await prisma.scheduleBlock.create({
      data: {
        startAt: at("10:00"),
        endAt: at("10:30"),
        reason: "Availability fixture",
      },
    });
    blockIds.push(availabilityBlock.id);
  });

  afterAll(async () => {
    if (blockIds.length)
      await prisma.scheduleBlock.deleteMany({
        where: { id: { in: blockIds } },
      });
    if (bookingIds.length)
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    if (packageId) await prisma.package.delete({ where: { id: packageId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });

    if (originalHours) {
      await prisma.operatingHour.upsert({
        where: { weekday },
        create: { weekday, ...originalHours },
        update: originalHours,
      });
    } else {
      await prisma.operatingHour.deleteMany({ where: { weekday } });
    }
    await prisma.$disconnect();
  });

  it("combines hours, active bookings, holds, and blocks when serving availability", async () => {
    const result = await getPackageAvailability(packageId, date, now);
    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.startAt)).toEqual([
      at("10:36").toISOString(),
      at("10:48").toISOString(),
      at("11:00").toISOString(),
      at("11:12").toISOString(),
      at("13:36").toISOString(),
      at("13:48").toISOString(),
    ]);
  });

  it("reports affected active bookings without changing their booking states", async () => {
    const result = await getScheduleBlockConflicts(blockIds[0], now);
    expect(result?.bookings.map((booking) => booking.code)).toEqual([
      `schedule-${token}-confirmed-near-block`,
    ]);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingIds[1] },
    });
    expect(booking.status).toBe("CONFIRMED");

    await prisma.scheduleBlock.delete({ where: { id: blockIds[1] } });
    blockIds.splice(1, 1);
    const updatedAvailability = await getPackageAvailability(
      packageId,
      date,
      now,
    );
    expect(updatedAvailability?.slots.map((slot) => slot.startAt)).toContain(
      at("10:00").toISOString(),
    );
  });
});
