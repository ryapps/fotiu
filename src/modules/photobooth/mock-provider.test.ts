import { describe, expect, it } from "vitest";
import {
  createPhotoboothProvider,
  MockBoothProvider,
} from "@/modules/photobooth/mock-provider";
import { ProviderUnavailableError } from "@/modules/photobooth/provider";

describe("MockBoothProvider", () => {
  it("deduplicates start requests with the same idempotency key", async () => {
    const provider = new MockBoothProvider({
      mode: "success",
      completionDelayMs: 500,
    });
    const input = {
      photoSessionId: "session-a",
      idempotencyKey: "command-a",
    };
    const first = await provider.startSession(input);
    const retry = await provider.startSession(input);
    expect(retry).toEqual(first);
    expect(await provider.getStatus(first)).toBe("ACTIVE");
  });

  it("rejects reusing an idempotency key for another photo session", async () => {
    const provider = new MockBoothProvider({ mode: "success" });
    await provider.startSession({
      photoSessionId: "session-a",
      idempotencyKey: "command-a",
    });
    await expect(
      provider.startSession({
        photoSessionId: "session-b",
        idempotencyKey: "command-a",
      }),
    ).rejects.toThrow("cannot be reused");
  });

  it("simulates failure and unavailable without claiming completion", async () => {
    const failureProvider = new MockBoothProvider({
      mode: "failure",
      completionDelayMs: 0,
    });
    const failed = await failureProvider.startSession({
      photoSessionId: "session-failed",
      idempotencyKey: "command-failed",
    });
    expect(await failureProvider.getStatus(failed)).toBe("FAILED");

    const unavailable = createPhotoboothProvider("mock", {
      mode: "unavailable",
    });
    await expect(
      unavailable.startSession({
        photoSessionId: "session-offline",
        idempotencyKey: "command-offline",
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(await unavailable.getStatus({})).toBe("UNAVAILABLE");
  });

  it("can delay the provider start response", async () => {
    const provider = new MockBoothProvider({
      mode: "delay",
      delayMs: 25,
      completionDelayMs: 500,
    });
    const startedAt = Date.now();
    const session = await provider.startSession({
      photoSessionId: "session-delayed",
      idempotencyKey: "command-delayed",
    });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20);
    expect(await provider.getStatus(session)).toBe("ACTIVE");
  });

  it("documents unsupported stop and reprint capabilities", () => {
    const provider = createPhotoboothProvider("mock");
    expect(provider.capabilities.supportsStopSession).toBe(false);
    expect(provider.capabilities.supportsReprint).toBe(false);
    expect(provider.stopSession).toBeUndefined();
    expect(provider.reprint).toBeUndefined();
  });
});
