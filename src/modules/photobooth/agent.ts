import { createHash } from "node:crypto";
import { z } from "zod";
import type { BoothAgentConfig } from "@/modules/photobooth/agent-config";
import {
  normalizeProviderStatus,
  ProviderUnavailableError,
  type PhotoboothProvider,
  type NormalizedSessionEventType,
} from "@/modules/photobooth/provider";

const commandSchema = z.object({
  id: z.string().min(1),
  photoSessionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  type: z.literal("START_SESSION"),
});
const sessionsSchema = z.array(
  z.object({
    photoSessionId: z.string().min(1),
    providerSessionId: z.string().min(1).nullable(),
    status: z.enum(["STARTING", "ACTIVE", "PROCESSING"]),
  }),
);
const claimResponseSchema = z.object({
  ok: z.literal(true),
  command: commandSchema.nullable(),
  activeSessions: sessionsSchema.default([]),
});
const okResponseSchema = z.object({ ok: z.literal(true) });

type MonitoredSession = {
  photoSessionId: string;
  providerSessionId?: string;
  startEventSent: boolean;
  retryEvent: NormalizedSessionEventType | null;
};

export class BoothAgentUnauthorizedError extends Error {
  constructor() {
    super("Booth agent credential is unauthorized or revoked.");
    this.name = "BoothAgentUnauthorizedError";
  }
}

export function createBoothAgent(input: {
  config: BoothAgentConfig;
  provider: PhotoboothProvider;
  fetcher?: typeof fetch;
  onError?: (error: unknown) => void;
}) {
  const fetcher = input.fetcher ?? fetch;
  const monitored = new Map<string, MonitoredSession>();

  async function request<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(new URL(path, input.config.baseUrl), {
        ...init,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${input.config.deviceToken}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
        cache: "no-store",
        redirect: "error",
        signal: init.signal ?? AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error("Booth cloud endpoint could not be reached.");
    }
    if (response.status === 401 || response.status === 403)
      throw new BoothAgentUnauthorizedError();
    if (!response.ok)
      throw new Error(`Booth cloud endpoint returned HTTP ${response.status}.`);
    const body: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new Error("Booth cloud endpoint returned an invalid response.");
    return parsed.data;
  }

  const postOk = (path: string, body?: unknown) =>
    request(
      path,
      {
        method: "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      okResponseSchema,
    );

  async function emitEvent(
    session: MonitoredSession,
    type: NormalizedSessionEventType,
  ) {
    const eventId = createHash("sha256")
      .update(`${input.config.deviceId}:${session.photoSessionId}:${type}`)
      .digest("hex");
    await postOk("/api/agent/events", {
      eventId,
      photoSessionId: session.photoSessionId,
      type,
      occurredAt: new Date().toISOString(),
    });
  }

  async function monitorSession(session: MonitoredSession) {
    let status: Awaited<ReturnType<PhotoboothProvider["getStatus"]>>;
    try {
      status = await input.provider.getStatus({
        providerSessionId: session.providerSessionId,
      });
    } catch {
      return;
    }
    const normalized = normalizeProviderStatus(status);
    if (!normalized) return;
    if (normalized === "SESSION_STARTED") {
      if (!session.startEventSent || session.retryEvent === normalized) {
        await emitEvent(session, normalized);
        session.startEventSent = true;
        session.retryEvent = null;
      }
      return;
    }
    if (!session.startEventSent) {
      await emitEvent(session, "SESSION_STARTED");
      session.startEventSent = true;
    }
    if (session.retryEvent !== normalized) session.retryEvent = normalized;
    await emitEvent(session, normalized);
    session.retryEvent = null;
    monitored.delete(session.photoSessionId);
  }

  async function processCommand(command: z.infer<typeof commandSchema>) {
    if (!input.provider.capabilities.supportsStartSession) {
      await postOk(
        `/api/agent/commands/${encodeURIComponent(command.id)}/result`,
        {
          outcome: "FAILED",
          errorCode: "UNSUPPORTED_CAPABILITY",
        },
      );
      return;
    }
    let result: Awaited<ReturnType<PhotoboothProvider["startSession"]>>;
    try {
      result = await input.provider.startSession({
        photoSessionId: command.photoSessionId,
        idempotencyKey: command.idempotencyKey,
      });
    } catch (error) {
      await postOk(
        `/api/agent/commands/${encodeURIComponent(command.id)}/result`,
        {
          outcome: "FAILED",
          errorCode:
            error instanceof ProviderUnavailableError
              ? "PROVIDER_UNAVAILABLE"
              : "PROVIDER_ERROR",
        },
      );
      return;
    }
    await postOk(
      `/api/agent/commands/${encodeURIComponent(command.id)}/result`,
      {
        outcome: "SUCCESS",
        providerSessionId: result.providerSessionId ?? null,
      },
    );
    monitored.set(command.photoSessionId, {
      photoSessionId: command.photoSessionId,
      ...(result.providerSessionId
        ? { providerSessionId: result.providerSessionId }
        : {}),
      startEventSent: false,
      retryEvent: null,
    });
    // The command result records only that the adapter accepted the request.
    // Session state changes only when a normalized event is posted below.
  }

  async function runOnce() {
    await postOk("/api/agent/heartbeat");
    const claimed = await request(
      "/api/agent/commands",
      { method: "GET" },
      claimResponseSchema,
    );
    for (const session of claimed.activeSessions) {
      if (!input.provider.capabilities.supportsStartSession) continue;
      if (!monitored.has(session.photoSessionId)) {
        monitored.set(session.photoSessionId, {
          photoSessionId: session.photoSessionId,
          ...(session.providerSessionId
            ? { providerSessionId: session.providerSessionId }
            : {}),
          startEventSent: session.status !== "STARTING",
          retryEvent: null,
        });
      }
    }
    if (claimed.command) await processCommand(claimed.command);
    for (const session of monitored.values()) await monitorSession(session);
  }

  async function run(signal: AbortSignal) {
    while (!signal.aborted) {
      const startedAt = Date.now();
      try {
        await runOnce();
      } catch (error) {
        input.onError?.(error);
        if (error instanceof BoothAgentUnauthorizedError) throw error;
      }
      const remainingMs = Math.max(
        0,
        input.config.pollIntervalMs - (Date.now() - startedAt),
      );
      if (remainingMs === 0 || signal.aborted) continue;
      await new Promise<void>((resolve) => {
        const onAbort = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, remainingMs);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
    }
  }

  return { run, runOnce };
}
