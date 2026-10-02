import { createHash } from "node:crypto";
import {
  ProviderUnavailableError,
  UnsupportedProviderError,
  type PhotoboothProvider,
  type ProviderSessionStatus,
} from "@/modules/photobooth/provider";
import {
  PhotoboothAppProvider,
  type PhotoboothAppConfig,
} from "@/modules/photobooth/photobooth-app-provider";

export type MockProviderMode = "success" | "failure" | "unavailable" | "delay";

export type MockBoothProviderOptions = {
  mode: MockProviderMode;
  delayMs?: number;
  completionDelayMs?: number;
};

type MockSession = {
  startedAt: number;
};

function wait(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

export class MockBoothProvider implements PhotoboothProvider {
  readonly capabilities = {
    supportsStartSession: true,
    // P0 demonstrates the documented polling fallback; the agent normalizes
    // statuses into the same event inbox used by providers with push events.
    supportsSessionEvents: false,
    supportsStopSession: false,
    supportsReprint: false,
  } as const;

  private readonly sessionStarts = new Map<
    string,
    { photoSessionId: string; result: Promise<string> }
  >();
  private readonly sessions = new Map<string, MockSession>();

  constructor(private readonly options: MockBoothProviderOptions) {
    for (const duration of [
      options.delayMs ?? 0,
      options.completionDelayMs ?? 3000,
    ]) {
      if (!Number.isSafeInteger(duration) || duration < 0) {
        throw new RangeError(
          "Mock provider delays must be non-negative integers.",
        );
      }
    }
  }

  async startSession(input: {
    photoSessionId: string;
    idempotencyKey: string;
  }): Promise<{ providerSessionId?: string }> {
    if (!input.photoSessionId.trim() || !input.idempotencyKey.trim()) {
      throw new TypeError("Photo session and idempotency key are required.");
    }
    if (this.options.mode === "unavailable")
      throw new ProviderUnavailableError();

    const previous = this.sessionStarts.get(input.idempotencyKey);
    if (previous) {
      if (previous.photoSessionId !== input.photoSessionId) {
        throw new TypeError(
          "An idempotency key cannot be reused for another photo session.",
        );
      }
      return { providerSessionId: await previous.result };
    }

    const pending = this.createSession(input.idempotencyKey);
    const start = { photoSessionId: input.photoSessionId, result: pending };
    this.sessionStarts.set(input.idempotencyKey, start);
    try {
      return { providerSessionId: await pending };
    } catch (error) {
      if (this.sessionStarts.get(input.idempotencyKey) === start) {
        this.sessionStarts.delete(input.idempotencyKey);
      }
      throw error;
    }
  }

  async getStatus(input: {
    providerSessionId?: string;
  }): Promise<ProviderSessionStatus> {
    if (this.options.mode === "unavailable") return "UNAVAILABLE";
    if (!input.providerSessionId) return "UNAVAILABLE";

    const session = this.sessions.get(input.providerSessionId);
    if (!session) return "UNAVAILABLE";
    const completed =
      Date.now() - session.startedAt >=
      (this.options.completionDelayMs ?? 3000);
    if (!completed) return "ACTIVE";
    return this.options.mode === "failure" ? "FAILED" : "COMPLETED";
  }

  private async createSession(idempotencyKey: string) {
    if (this.options.mode === "delay") await wait(this.options.delayMs ?? 1000);
    const id = `mock-session-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`;
    this.sessions.set(id, {
      startedAt: Date.now(),
    });
    return id;
  }
}

/**
 * FreeBooth has no documented remote session-control or status interface.
 * The Local Booth Agent can still provide booth heartbeat while operators
 * start FreeBooth locally and record the manual handoff in Fotiu.
 */
export class FreeBoothManualProvider implements PhotoboothProvider {
  readonly capabilities = {
    supportsStartSession: false,
    supportsSessionEvents: false,
    supportsStopSession: false,
    supportsReprint: false,
  } as const;

  async startSession(): Promise<{ providerSessionId?: string }> {
    throw new UnsupportedProviderError("freebooth remote session start");
  }

  async getStatus(): Promise<ProviderSessionStatus> {
    return "UNAVAILABLE";
  }
}

export function createPhotoboothProvider(
  providerKey: string,
  mockOptions: MockBoothProviderOptions = { mode: "success" },
  photoboothAppConfig?: PhotoboothAppConfig,
): PhotoboothProvider {
  if (providerKey === "mock") return new MockBoothProvider(mockOptions);
  if (providerKey === "freebooth") return new FreeBoothManualProvider();
  if (providerKey === "photobooth_app" && photoboothAppConfig) {
    return new PhotoboothAppProvider(photoboothAppConfig);
  }
  throw new UnsupportedProviderError(providerKey);
}
