export type PhotoSessionStatus =
  "READY" | "STARTING" | "ACTIVE" | "PROCESSING" | "COMPLETED" | "FAILED";

export type PhotoSessionEvent =
  "SESSION_STARTED" | "SESSION_COMPLETED" | "SESSION_FAILED";

const transitions: Record<
  PhotoSessionEvent,
  Partial<Record<PhotoSessionStatus, PhotoSessionStatus>>
> = {
  SESSION_STARTED: { STARTING: "ACTIVE" },
  SESSION_COMPLETED: { ACTIVE: "COMPLETED", PROCESSING: "COMPLETED" },
  SESSION_FAILED: {
    STARTING: "FAILED",
    ACTIVE: "FAILED",
    PROCESSING: "FAILED",
  },
};

export function transitionPhotoSession(
  status: PhotoSessionStatus,
  event: PhotoSessionEvent,
): PhotoSessionStatus | null {
  return transitions[event][status] ?? null;
}
