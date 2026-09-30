import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { createBookingForCustomer } from "@/modules/booking/create-booking";
import { expireStaleHolds } from "@/modules/booking/expiry";
import { transitionBooking } from "@/modules/booking/state-machine";
import {
  addCalendarDays,
  getLocalDate,
  localDateTimeToUtc,
  weekdayForLocalDate,
} from "@/modules/scheduling/time";

const token = randomUUID();
const now = new Date();
const dates = [20, 21, 22].map((offset) =>
  addCalendarDays(getLocalDate(now, env.STUDIO_TIMEZONE), offset),
);
const weekdays = [...new Set(dates.map(weekdayForLocalDate))];
const originalHours = new Map<
  number,
  { isOpen: boolean; openTime: string; closeTime: string } | null
>();
const userIds: string[] = [];
const packageIds: string[] = [];
const bookingIds: string[] = [];
let packageId = "";
let customerA = "";
let customerB = "";
let customerC = "";
let customerD = "";
let customerE = "";
const at = (dateIndex: number, time: string) =>
  localDateTimeToUtc(`${dates[dateIndex]}T${time}`, env.STUDIO_TIMEZONE);

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: {
      googleSub: `booking-${token}-${label}`,
      email: `booking-${token}-${label}@example.test`,
      name: label,
    },
  });
  userIds.push(user.id);
  return user.id;
}

describe("booking creation and expiry against PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const weekday of weekdays) {
      const existing = await prisma.operatingHour.findUnique({
        where: { weekday },
      });
      originalHours.set(
        weekday,
        existing
          ? {
              isOpen: existing.isOpen,
              openTime: existing.openTime,
              closeTime: existing.closeTime,
            }
          : null,
      );
      await prisma.operatingHour.upsert({
        where: { weekday },
        create: {
          weekday,
          isOpen: true,
          openTime: "09:00",
          closeTime: "17:00",
        },
        update: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
      });
    }
    customerA = await makeUser("A");
    customerB = await makeUser("B");
    customerC = await makeUser("C");
    customerD = await makeUser("D");
    customerE = await makeUser("E");
    const photoPackage = await prisma.package.create({
      data: {
        slug: `booking-${token}`,
        name: "Booking Fixture",
        description: "Integration fixture",
        price: 123_000,
        durationMinutes: 60,
      },
    });
    packageId = photoPackage.id;
    packageIds.push(packageId);
  });

  afterAll(async () => {
    const fixtures = await prisma.booking.findMany({
      where: {
        OR: [{ id: { in: bookingIds } }, { packageId: { in: packageIds } }],
      },
      select: { id: true },
    });
    if (fixtures.length)
      await prisma.payment.deleteMany({
        where: { bookingId: { in: fixtures.map(({ id }) => id) } },
      });
    await prisma.booking.deleteMany({
      where: {
        OR: [{ id: { in: bookingIds } }, { packageId: { in: packageIds } }],
      },
    });
    if (packageIds.length)
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
    if (userIds.length)
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const [weekday, hours] of originalHours) {
      if (hours)
        await prisma.operatingHour.upsert({
          where: { weekday },
          create: { weekday, ...hours },
          update: hours,
        });
      else await prisma.operatingHour.deleteMany({ where: { weekday } });
    }
    await prisma.$disconnect();
  });

  it("creates a server-priced WAITING_PAYMENT booking and UNPAID payment", async () => {
    const result = await createBookingForCustomer(
      customerA,
      { packageId, startAt: at(0, "10:00"), customerNote: "Catatan" },
      now,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    bookingIds.push(result.booking.id);
    expect(result.booking.status).toBe("WAITING_PAYMENT");
    expect(result.booking.priceSnapshot).toBe(123_000);
    expect(result.booking.startAt).toEqual(at(0, "10:00"));
    expect(result.booking.endAt).toEqual(at(0, "11:00"));
    expect(result.booking.holdExpiresAt).toEqual(
      new Date(now.getTime() + env.BOOKING_HOLD_MINUTES * 60_000),
    );
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { bookingId: result.booking.id },
    });
    expect(payment.status).toBe("UNPAID");
    expect(payment.providerOrderId).toBe(result.booking.code);
    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: result.booking.id },
    });
    expect(stored.customerNote).toBe("Catatan");
  });

  it("sweeps a stale hold before reusing its slot", async () => {
    const photoPackage = await prisma.package.findUniqueOrThrow({
      where: { id: packageId },
    });
    const stale = await prisma.booking.create({
      data: {
        code: `stale-${token}`,
        userId: customerB,
        packageId,
        packageNameSnapshot: photoPackage.name,
        priceSnapshot: photoPackage.price,
        startAt: at(1, "10:00"),
        endAt: at(1, "11:00"),
        status: "WAITING_PAYMENT",
        holdExpiresAt: new Date(now.getTime() - 1),
        payment: {
          create: {
            provider: "midtrans",
            providerOrderId: `stale-${token}`,
            amount: photoPackage.price,
            status: "UNPAID",
          },
        },
      },
    });
    bookingIds.push(stale.id);
    const result = await createBookingForCustomer(
      customerA,
      { packageId, startAt: at(1, "10:00") },
      now,
    );
    expect(result.ok).toBe(true);
    if (result.ok) bookingIds.push(result.booking.id);
    const expired = await prisma.booking.findUniqueOrThrow({
      where: { id: stale.id },
      include: { payment: true },
    });
    expect(expired.status).toBe("EXPIRED");
    expect(expired.payment?.status).toBe("EXPIRED");
  });

  it("allows exactly one of two customers racing for the same slot", async () => {
    const results = await Promise.all([
      createBookingForCustomer(
        customerC,
        { packageId, startAt: at(2, "10:00") },
        now,
      ),
      createBookingForCustomer(
        customerD,
        { packageId, startAt: at(2, "10:00") },
        now,
      ),
    ]);
    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (successes[0]?.ok) bookingIds.push(successes[0].booking.id);
    if (!failures[0]?.ok) expect(failures[0].code).toBe("CONFLICT");
    const active = await prisma.booking.count({
      where: {
        packageId,
        startAt: at(2, "10:00"),
        status: { in: ["WAITING_PAYMENT", "CONFIRMED"] },
      },
    });
    expect(active).toBe(1);
  });

  it("serializes a customer's hold cap check", async () => {
    const first = await createBookingForCustomer(
      customerE,
      { packageId, startAt: at(0, "14:00") },
      now,
    );
    expect(first.ok).toBe(true);
    if (first.ok) bookingIds.push(first.booking.id);
    const results = await Promise.all([
      createBookingForCustomer(
        customerE,
        { packageId, startAt: at(1, "15:00") },
        now,
      ),
      createBookingForCustomer(
        customerE,
        { packageId, startAt: at(2, "15:00") },
        now,
      ),
    ]);
    for (const result of results)
      if (result.ok) bookingIds.push(result.booking.id);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    const rejected = results.find((result) => !result.ok);
    if (rejected && !rejected.ok)
      expect(rejected.code, JSON.stringify(results)).toBe("HOLD_LIMIT");
  });

  it("makes repeated expiry sweeps idempotent", async () => {
    const photoPackage = await prisma.package.findUniqueOrThrow({
      where: { id: packageId },
    });
    const stale = await prisma.booking.create({
      data: {
        code: `repeat-expiry-${token}`,
        userId: customerC,
        packageId,
        packageNameSnapshot: photoPackage.name,
        priceSnapshot: photoPackage.price,
        startAt: at(0, "16:00"),
        endAt: at(0, "17:00"),
        status: "WAITING_PAYMENT",
        holdExpiresAt: new Date(now.getTime() - 1),
        payment: {
          create: {
            provider: "midtrans",
            providerOrderId: `repeat-expiry-${token}`,
            amount: photoPackage.price,
            status: "UNPAID",
          },
        },
      },
    });
    bookingIds.push(stale.id);
    const count = await prisma.$transaction((tx) => expireStaleHolds(tx, now));
    expect(count).toBe(1);
    const repeated = await prisma.$transaction((tx) =>
      expireStaleHolds(tx, now),
    );
    expect(repeated).toBe(0);
    const expired = await prisma.booking.findUniqueOrThrow({
      where: { id: stale.id },
      include: { payment: true },
    });
    expect(expired.status).toBe("EXPIRED");
    expect(expired.payment?.status).toBe("EXPIRED");
  });

  it("lets the first conditional transition win between expiry and confirmation", async () => {
    const photoPackage = await prisma.package.findUniqueOrThrow({
      where: { id: packageId },
    });
    const pending = await prisma.booking.create({
      data: {
        code: `expiry-confirm-race-${token}`,
        userId: customerD,
        packageId,
        packageNameSnapshot: photoPackage.name,
        priceSnapshot: photoPackage.price,
        startAt: at(2, "16:00"),
        endAt: at(2, "17:00"),
        status: "WAITING_PAYMENT",
        holdExpiresAt: new Date(now.getTime() - 1),
        payment: {
          create: {
            provider: "midtrans",
            providerOrderId: `expiry-confirm-race-${token}`,
            amount: photoPackage.price,
            status: "UNPAID",
          },
        },
      },
    });
    bookingIds.push(pending.id);

    await Promise.all([
      prisma.$transaction((tx) => expireStaleHolds(tx, now)),
      prisma.$transaction(async (tx) => {
        const transitioned = await transitionBooking(
          tx,
          pending.id,
          "WAITING_PAYMENT",
          "CONFIRMED",
        );
        if (transitioned) {
          await tx.payment.update({
            where: { bookingId: pending.id },
            data: { status: "PAID", paidAt: now },
          });
        }
      }),
    ]);

    const result = await prisma.booking.findUniqueOrThrow({
      where: { id: pending.id },
      include: { payment: true },
    });
    expect(["EXPIRED", "CONFIRMED"]).toContain(result.status);
    expect(result.payment?.status).toBe(
      result.status === "EXPIRED" ? "EXPIRED" : "PAID",
    );
  });
});
