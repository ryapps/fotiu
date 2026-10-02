import { createHash, timingSafeEqual } from "node:crypto";
import {
  ProviderUnavailableError,
  type PhotoboothProvider,
  type ProviderSessionStatus,
} from "@/modules/photobooth/provider";

export type PhotoboothAppConfig = {
  baseUrl: URL;
  actionType: "image" | "collage" | "animation" | "video" | "multicamera";
  actionIndex: number;
  callbackToken: string;
};

type SessionState = { status: ProviderSessionStatus };

/**
 * Adapter for the Photobooth-App's documented action endpoint. The app's
 * Commander plugin reports lifecycle callbacks to the agent's loopback server.
 */
export class PhotoboothAppProvider implements PhotoboothProvider {
  readonly capabilities = {
    supportsStartSession: true,
    supportsSessionEvents: true,
    supportsStopSession: false,
    supportsReprint: false,
  } as const;

  private readonly sessions = new Map<string, SessionState>();
  private activeSession: {
    photoSessionId: string;
    providerSessionId: string;
  } | null = null;
  private readonly starts = new Map<
    string,
    { photoSessionId: string; providerSessionId: string; result: Promise<void> }
  >();

  constructor(
    private readonly config: PhotoboothAppConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async startSession(input: {
    photoSessionId: string;
    idempotencyKey: string;
  }): Promise<{ providerSessionId?: string }> {
    const existingStart = this.starts.get(input.idempotencyKey);
    if (existingStart) {
      if (existingStart.photoSessionId !== input.photoSessionId) {
        throw new Error(
          "Photobooth idempotency key belongs to another session.",
        );
      }
      await existingStart.result;
      return { providerSessionId: existingStart.providerSessionId };
    }
    if (
      this.activeSession &&
      this.activeSession.photoSessionId !== input.photoSessionId
    ) {
      throw new Error("Photobooth-App already has an active Fotiu session.");
    }

    const providerSessionId = `photobooth-app-${createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex")
      .slice(0, 24)}`;
    this.activeSession = {
      photoSessionId: input.photoSessionId,
      providerSessionId,
    };
    this.sessions.set(providerSessionId, { status: "STARTING" });

    const start = this.triggerAction();
    this.starts.set(input.idempotencyKey, {
      photoSessionId: input.photoSessionId,
      providerSessionId,
      result: start,
    });
    try {
      await start;
      return { providerSessionId };
    } catch (error) {
      this.sessions.delete(providerSessionId);
      this.activeSession = null;
      this.starts.delete(input.idempotencyKey);
      throw error;
    }
  }

  async getStatus(input: {
    providerSessionId?: string;
  }): Promise<ProviderSessionStatus> {
    if (!input.providerSessionId) return "UNAVAILABLE";
    const existing = this.sessions.get(input.providerSessionId);
    if (existing) return existing.status;

    // Restore monitoring after an agent restart. No success is inferred here;
    // the session remains STARTING until Commander reports a lifecycle event.
    this.sessions.set(input.providerSessionId, { status: "STARTING" });
    this.activeSession ??= {
      photoSessionId: input.providerSessionId,
      providerSessionId: input.providerSessionId,
    };
    return "STARTING";
  }

  acceptCallback(token: string | null, event: string | null) {
    if (!this.matchesCallbackToken(token)) return false;
    if (!event || !["counting", "capture", "finished"].includes(event)) {
      return false;
    }
    if (!this.activeSession) return false;
    const target = this.sessions.get(this.activeSession.providerSessionId);
    if (!target) return false;
    target.status = event === "finished" ? "COMPLETED" : "ACTIVE";
    if (event === "finished") this.activeSession = null;
    return true;
  }

  private matchesCallbackToken(token: string | null) {
    if (!token) return false;
    const expected = Buffer.from(this.config.callbackToken);
    const received = Buffer.from(token);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  private async triggerAction() {
    const url = new URL(
      `/api/actions/${this.config.actionType}/${this.config.actionIndex}`,
      this.config.baseUrl,
    );
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ProviderUnavailableError();
    }
    if (!response.ok) {
      throw new Error(
        `Photobooth-App rejected the action (HTTP ${response.status}).`,
      );
    }
  }
}
