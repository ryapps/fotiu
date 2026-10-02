import "server-only";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { calculateAvailability } from "@/modules/scheduling/availability";
import {
  PHOTO_SESSION_BUFFER_MINUTES,
  PHOTO_SESSION_DURATION_MINUTES,
  PHOTO_SESSION_SLOT_INTERVAL_MINUTES,
} from "@/modules/scheduling/session-duration";
import {
  localDayBoundsUtc,
  weekdayForLocalDate,
} from "@/modules/scheduling/time";

export async function getPackageAvailability(
  packageId: string,
  date: string,
  now = new Date(),
) {
  return getPackageAvailabilityWithClient(prisma, packageId, date, now);
}

export async function getPackageAvailabilityWithClient(
  client: Prisma.TransactionClient,
  packageId: string,
  date: string,
  now = new Date(),
) {
  const photoPackage = await client.package.findFirst({
    where: { id: packageId, isActive: true },
    select: { id: true },
  });
  if (!photoPackage) return null;

  const weekday = weekdayForLocalDate(date);
  const operatingHour = await client.operatingHour.findUnique({
    where: { weekday },
  });
  if (!operatingHour || !operatingHour.isOpen) {
    return {
      date,
      timeZone: env.STUDIO_TIMEZONE,
      slots: [],
    };
  }

  const bounds = localDayBoundsUtc(date, env.STUDIO_TIMEZONE);
  const [blocks, bookings] = await Promise.all([
    client.scheduleBlock.findMany({
      where: { startAt: { lt: bounds.end }, endAt: { gt: bounds.start } },
      select: { startAt: true, endAt: true },
    }),
    client.booking.findMany({
      where: {
        startAt: { lt: bounds.end },
        endAt: { gt: bounds.start },
        OR: [
          { status: "CONFIRMED" },
          { status: "WAITING_PAYMENT", holdExpiresAt: { gt: now } },
        ],
      },
      select: { startAt: true, endAt: true, status: true, holdExpiresAt: true },
    }),
  ]);

  const slots = calculateAvailability({
    date,
    timeZone: env.STUDIO_TIMEZONE,
    now,
    isOpen: operatingHour.isOpen,
    openTime: operatingHour.openTime,
    closeTime: operatingHour.closeTime,
    durationMinutes: PHOTO_SESSION_DURATION_MINUTES,
    bufferMinutes: PHOTO_SESSION_BUFFER_MINUTES,
    slotIntervalMinutes: PHOTO_SESSION_SLOT_INTERVAL_MINUTES,
    minLeadHours: env.MIN_LEAD_HOURS,
    maxAdvanceDays: env.MAX_ADVANCE_DAYS,
    bookings,
    blocks,
  });

  return {
    date,
    timeZone: env.STUDIO_TIMEZONE,
    slots: slots.map(({ startAt, endAt }) => ({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    })),
  };
}

export async function getScheduleBlockConflicts(
  blockId: string,
  now = new Date(),
) {
  const block = await prisma.scheduleBlock.findUnique({
    where: { id: blockId },
  });
  if (!block) return null;

  const bookings = await prisma.booking.findMany({
    where: {
      startAt: { lt: block.endAt },
      endAt: { gt: block.startAt },
      OR: [
        { status: "CONFIRMED" },
        { status: "WAITING_PAYMENT", holdExpiresAt: { gt: now } },
      ],
    },
    select: {
      code: true,
      packageNameSnapshot: true,
      startAt: true,
      endAt: true,
      status: true,
      user: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
  });

  return { block, bookings };
}
