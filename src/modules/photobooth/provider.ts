export type ProviderSessionStatus =
  "STARTING" | "ACTIVE" | "PROCESSING" | "COMPLETED" | "FAILED" | "UNAVAILABLE";

export type NormalizedSessionEventType =
  "SESSION_STARTED" | "SESSION_COMPLETED" | "SESSION_FAILED";

export type ProviderCapabilities = {
  supportsStartSession: boolean;
  supportsSessionEvents: boolean;
  supportsStopSession: boolean;
  supportsReprint: boolean;
};

export interface PhotoboothProvider {
  readonly capabilities: ProviderCapabilities;
  startSession(input: {
    photoSessionId: string;
    idempotencyKey: string;
  }): Promise<{ providerSessionId?: string }>;
  getStatus(input: {
    providerSessionId?: string;
  }): Promise<ProviderSessionStatus>;
  stopSession?(input: { providerSessionId: string }): Promise<void>;
  reprint?(input: { providerSessionId: string }): Promise<void>;
}

export class ProviderUnavailableError extends Error {
  constructor() {
    super("Photobooth provider is unavailable.");
    this.name = "ProviderUnavailableError";
  }
}

export class UnsupportedProviderError extends Error {
  constructor(providerKey: string) {
    super(`Photobooth provider is not configured: ${providerKey}`);
    this.name = "UnsupportedProviderError";
  }
}

export function normalizeProviderStatus(
  status: ProviderSessionStatus,
): NormalizedSessionEventType | null {
  if (status === "ACTIVE") return "SESSION_STARTED";
  if (status === "COMPLETED") return "SESSION_COMPLETED";
  if (status === "FAILED") return "SESSION_FAILED";
  return null;
}
