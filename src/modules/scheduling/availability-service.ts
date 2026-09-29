import "server-only";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { calculateAvailability } from "@/modules/scheduling/availability";
import {
  localDayBoundsUtc,
  weekdayForLocalDate,
} from "@/modules/scheduling/time";

export async function getPackageAvailability(
  packageId: string,
  date: string,
  now = new Date(),
) {
  const photoPackage = await prisma.package.findFirst({
    where: { id: packageId, isActive: true },
    select: { durationMinutes: true, bufferMinutes: true },
  });
  if (!photoPackage) return null;

  const weekday = weekdayForLocalDate(date);
  const operatingHour = await prisma.operatingHour.findUnique({
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
    prisma.scheduleBlock.findMany({
      where: { startAt: { lt: bounds.end }, endAt: { gt: bounds.start } },
      select: { startAt: true, endAt: true },
    }),
    prisma.booking.findMany({
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
    durationMinutes: photoPackage.durationMinutes,
    bufferMinutes: photoPackage.bufferMinutes,
    slotIntervalMinutes: env.SLOT_INTERVAL_MINUTES,
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
