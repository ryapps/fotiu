import { getLocalDate, localDateTimeToUtc } from "@/modules/scheduling/time";

export type TimeRange = { startAt: Date; endAt: Date };

export type AvailabilityBooking = TimeRange & {
  status: "WAITING_PAYMENT" | "CONFIRMED" | string;
  holdExpiresAt: Date | null;
};

export type AvailabilitySlot = TimeRange;

export type CalculateAvailabilityInput = {
  date: string;
  timeZone: string;
  now: Date;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  durationMinutes: number;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minLeadHours: number;
  maxAdvanceDays: number;
  bookings: AvailabilityBooking[];
  blocks: TimeRange[];
};

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Operating hours must use HH:mm format.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new RangeError("Invalid operating hour.");
  return hour * 60 + minute;
}

function overlaps(first: TimeRange, second: TimeRange) {
  return first.startAt < second.endAt && second.startAt < first.endAt;
}

export function calculateAvailability(
  input: CalculateAvailabilityInput,
): AvailabilitySlot[] {
  const {
    date,
    timeZone,
    now,
    isOpen,
    openTime,
    closeTime,
    durationMinutes,
    bufferMinutes,
    slotIntervalMinutes,
    minLeadHours,
    maxAdvanceDays,
    bookings,
    blocks,
  } = input;

  if (!isOpen || getLocalDate(now, timeZone) > date) return [];

  const dayOffset = Math.floor(
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${getLocalDate(now, timeZone)}T00:00:00Z`)) /
      86_400_000,
  );
  if (dayOffset > maxAdvanceDays) return [];

  const opensAt = timeToMinutes(openTime);
  const closesAt = timeToMinutes(closeTime);
  if (
    closesAt <= opensAt ||
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isSafeInteger(bufferMinutes) ||
    bufferMinutes < 0 ||
    !Number.isSafeInteger(slotIntervalMinutes) ||
    slotIntervalMinutes <= 0 ||
    !Number.isSafeInteger(minLeadHours) ||
    minLeadHours < 0 ||
    !Number.isSafeInteger(maxAdvanceDays) ||
    maxAdvanceDays < 0
  ) {
    throw new RangeError("Invalid availability configuration.");
  }

  const closingAt = localDateTimeToUtc(
    `${date}T${closeTime}`,
    timeZone,
  ).getTime();
  const earliestStart = now.getTime() + minLeadHours * 60 * 60 * 1000;
  const sessionMinutes = durationMinutes + bufferMinutes;
  const slots: AvailabilitySlot[] = [];

  for (
    let minuteOfDay = opensAt;
    minuteOfDay < closesAt;
    minuteOfDay += slotIntervalMinutes
  ) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const startAt = localDateTimeToUtc(
      `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      timeZone,
    );
    const endAt = new Date(startAt.getTime() + sessionMinutes * 60_000);
    const candidate = { startAt, endAt };

    if (startAt.getTime() < earliestStart || endAt.getTime() > closingAt)
      continue;

    const blocked = blocks.some((block) => overlaps(candidate, block));
    if (blocked) continue;

    const booked = bookings.some((booking) => {
      const active =
        booking.status === "CONFIRMED" ||
        (booking.status === "WAITING_PAYMENT" &&
          booking.holdExpiresAt !== null &&
          booking.holdExpiresAt.getTime() > now.getTime());
      return active && overlaps(candidate, booking);
    });
    if (!booked) slots.push(candidate);
  }

  return slots;
}
