import { describe, expect, it } from "vitest";
import { transitionPhotoSession } from "@/modules/photobooth/session-state";

describe("photo session state transitions", () => {
  it("starts only from STARTING and completes only from an active state", () => {
    expect(transitionPhotoSession("STARTING", "SESSION_STARTED")).toBe(
      "ACTIVE",
    );
    expect(transitionPhotoSession("STARTING", "SESSION_COMPLETED")).toBeNull();
    expect(transitionPhotoSession("ACTIVE", "SESSION_COMPLETED")).toBe(
      "COMPLETED",
    );
    expect(transitionPhotoSession("PROCESSING", "SESSION_COMPLETED")).toBe(
      "COMPLETED",
    );
  });

  it("allows failure without ever completing the booking", () => {
    expect(transitionPhotoSession("STARTING", "SESSION_FAILED")).toBe("FAILED");
    expect(transitionPhotoSession("ACTIVE", "SESSION_FAILED")).toBe("FAILED");
    expect(transitionPhotoSession("FAILED", "SESSION_COMPLETED")).toBeNull();
    expect(transitionPhotoSession("COMPLETED", "SESSION_FAILED")).toBeNull();
  });

  it("does not transition a READY or terminal session from provider events", () => {
    expect(transitionPhotoSession("READY", "SESSION_STARTED")).toBeNull();
    expect(transitionPhotoSession("COMPLETED", "SESSION_STARTED")).toBeNull();
  });
});
