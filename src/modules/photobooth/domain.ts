export type BoothReadStatus = "MAINTENANCE" | "OFFLINE" | "BUSY" | "ONLINE";

export function getBoothReadStatus(input: {
  isMaintenance: boolean;
  lastSeenAt: Date | null;
  hasActiveSession: boolean;
  now: Date;
  heartbeatTimeoutSeconds: number;
}): BoothReadStatus {
  if (input.isMaintenance) return "MAINTENANCE";

  const cutoff = input.now.getTime() - input.heartbeatTimeoutSeconds * 1000;
  if (!input.lastSeenAt || input.lastSeenAt.getTime() <= cutoff)
    return "OFFLINE";

  // An offline session remains reserved by the active-session database constraint.
  if (input.hasActiveSession) return "BUSY";
  return "ONLINE";
}
