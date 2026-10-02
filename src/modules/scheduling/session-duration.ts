export const PHOTO_SESSION_DURATION_MINUTES = 10;
export const PHOTO_SESSION_BUFFER_MINUTES = 2;
export const PHOTO_SESSION_SLOT_INTERVAL_MINUTES =
  PHOTO_SESSION_DURATION_MINUTES + PHOTO_SESSION_BUFFER_MINUTES;

export function isWithinPhotoSessionWindow(now: Date, startAt: Date) {
  const sessionEndsAt =
    startAt.getTime() + PHOTO_SESSION_DURATION_MINUTES * 60_000;
  return now >= startAt && now.getTime() < sessionEndsAt;
}
