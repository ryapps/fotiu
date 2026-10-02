import { describe, expect, it } from "vitest";
import { getBoothReadStatus } from "@/modules/photobooth/domain";

describe("derived booth read status", () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  const input = {
    now,
    heartbeatTimeoutSeconds: 45,
    lastSeenAt: new Date(now.getTime() - 10_000),
    isMaintenance: false,
    hasActiveSession: false,
  };

  it("distinguishes fresh online, busy, and stale offline presence", () => {
    expect(getBoothReadStatus(input)).toBe("ONLINE");
    expect(getBoothReadStatus({ ...input, hasActiveSession: true })).toBe(
      "BUSY",
    );
    expect(
      getBoothReadStatus({
        ...input,
        lastSeenAt: new Date(now.getTime() - 45_000),
        hasActiveSession: true,
      }),
    ).toBe("OFFLINE");
  });

  it("gives maintenance precedence and marks missing heartbeat offline", () => {
    expect(getBoothReadStatus({ ...input, isMaintenance: true })).toBe(
      "MAINTENANCE",
    );
    expect(getBoothReadStatus({ ...input, lastSeenAt: null })).toBe("OFFLINE");
  });
});
