export const PHOTO_SESSION_DURATION_MINUTES = 10;
export const PHOTO_SESSION_BUFFER_MINUTES = 2;
export const PHOTO_SESSION_SLOT_INTERVAL_MINUTES =
  PHOTO_SESSION_DURATION_MINUTES + PHOTO_SESSION_BUFFER_MINUTES;

export function getBookedSessionDurationMinutes(startAt: Date, endAt: Date) {
  return Math.max(
    0,
    (endAt.getTime() - startAt.getTime()) / 60_000 -
      PHOTO_SESSION_BUFFER_MINUTES,
  );
}

export function getCheckInWindowMinutes(startAt: Date, endAt: Date) {
  return Math.min(
    PHOTO_SESSION_DURATION_MINUTES,
    getBookedSessionDurationMinutes(startAt, endAt),
  );
}

export function isWithinPhotoSessionWindow(
  now: Date,
  startAt: Date,
  endAt?: Date,
) {
  const sessionEndsAt =
    startAt.getTime() +
    (endAt
      ? getCheckInWindowMinutes(startAt, endAt)
      : PHOTO_SESSION_DURATION_MINUTES) *
      60_000;
  return now >= startAt && now.getTime() < sessionEndsAt;
}
