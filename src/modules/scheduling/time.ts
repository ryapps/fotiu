type LocalDateParts = { year: number; month: number; day: number };
type LocalDateTimeParts = LocalDateParts & { hour: number; minute: number };

function numberPart(parts: Intl.DateTimeFormatPart[], type: string) {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new RangeError(`Missing ${type} in formatted date.`);
  return Number(value);
}

export function getLocalDateParts(
  date: Date,
  timeZone: string,
): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  return {
    year: numberPart(parts, "year"),
    month: numberPart(parts, "month"),
    day: numberPart(parts, "day"),
  };
}

export function formatLocalDate(parts: LocalDateParts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getLocalDate(date: Date, timeZone: string) {
  return formatLocalDate(getLocalDateParts(date, timeZone));
}

export function addCalendarDays(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return formatLocalDate({
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  });
}

export function weekdayForLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function localDateTimeToUtc(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Invalid local date and time.");

  const desired: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const desiredTimestamp = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  const dateCheck = new Date(desiredTimestamp);

  if (
    dateCheck.getUTCFullYear() !== desired.year ||
    dateCheck.getUTCMonth() + 1 !== desired.month ||
    dateCheck.getUTCDate() !== desired.day ||
    desired.hour > 23 ||
    desired.minute > 59
  ) {
    throw new RangeError("Invalid local date and time.");
  }

  const formatter = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let timestamp = desiredTimestamp;

  // Resolve the timezone offset from the formatted wall clock. This handles
  // IANA timezone offsets, including daylight saving transitions.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const actualTimestamp = Date.UTC(
      numberPart(parts, "year"),
      numberPart(parts, "month") - 1,
      numberPart(parts, "day"),
      numberPart(parts, "hour"),
      numberPart(parts, "minute"),
    );
    const difference = desiredTimestamp - actualTimestamp;
    timestamp += difference;
    if (difference === 0) break;
  }

  const finalParts = formatter.formatToParts(new Date(timestamp));
  const resolved: LocalDateTimeParts = {
    year: numberPart(finalParts, "year"),
    month: numberPart(finalParts, "month"),
    day: numberPart(finalParts, "day"),
    hour: numberPart(finalParts, "hour"),
    minute: numberPart(finalParts, "minute"),
  };

  if (
    resolved.year !== desired.year ||
    resolved.month !== desired.month ||
    resolved.day !== desired.day ||
    resolved.hour !== desired.hour ||
    resolved.minute !== desired.minute
  ) {
    throw new RangeError(
      "This local time does not exist in the configured timezone.",
    );
  }

  return new Date(timestamp);
}

export function localDayBoundsUtc(date: string, timeZone: string) {
  return {
    start: localDateTimeToUtc(`${date}T00:00`, timeZone),
    end: localDateTimeToUtc(`${addCalendarDays(date, 1)}T00:00`, timeZone),
  };
}

export function formatStudioDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
