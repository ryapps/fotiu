import { z } from "zod";

const rawConfigSchema = z.object({
  BOOTH_AGENT_BASE_URL: z.string().url(),
  BOOTH_DEVICE_ID: z.string().trim().min(1).max(128),
  BOOTH_DEVICE_TOKEN: z.string().min(32).max(512),
  BOOTH_PROVIDER_KEY: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
  BOOTH_MOCK_MODE: z
    .enum(["success", "failure", "unavailable", "delay"])
    .default("success"),
  BOOTH_MOCK_DELAY_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(300_000)
    .default(1_000),
  BOOTH_MOCK_COMPLETION_DELAY_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(86_400_000)
    .default(3_000),
  BOOTH_PHOTOBOOTH_APP_URL: z.string().url().optional(),
  BOOTH_PHOTOBOOTH_APP_ACTION: z
    .enum(["image", "collage", "animation", "video", "multicamera"])
    .default("image"),
  BOOTH_PHOTOBOOTH_APP_ACTION_INDEX: z.coerce
    .number()
    .int()
    .min(0)
    .max(99)
    .default(0),
  BOOTH_PHOTOBOOTH_APP_CALLBACK_TOKEN: z.string().min(32).max(256).optional(),
  BOOTH_PHOTOBOOTH_APP_CALLBACK_PORT: z.coerce
    .number()
    .int()
    .min(1024)
    .max(65535)
    .default(43127),
  BOOTH_POLL_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(2)
    .max(300)
    .default(10),
  BOOTH_HEARTBEAT_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(3600)
    .default(45),
});

export type BoothAgentConfig = {
  baseUrl: URL;
  deviceId: string;
  deviceToken: string;
  providerKey: string;
  mockMode: "success" | "failure" | "unavailable" | "delay";
  mockDelayMs: number;
  mockCompletionDelayMs: number;
  photoboothAppUrl?: URL;
  photoboothAppAction?:
    "image" | "collage" | "animation" | "video" | "multicamera";
  photoboothAppActionIndex?: number;
  photoboothAppCallbackToken?: string;
  photoboothAppCallbackPort?: number;
  pollIntervalMs: number;
};

export function parseBoothAgentConfig(
  environment: NodeJS.ProcessEnv,
): BoothAgentConfig {
  const parsed = rawConfigSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(
      `Invalid booth agent configuration: ${parsed.error.issues.map(({ path }) => path.join(".")).join(", ")}`,
    );
  }
  const baseUrl = new URL(parsed.data.BOOTH_AGENT_BASE_URL);
  const photoboothAppUrl = parsed.data.BOOTH_PHOTOBOOTH_APP_URL
    ? new URL(parsed.data.BOOTH_PHOTOBOOTH_APP_URL)
    : undefined;
  const isLocalHttp =
    baseUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname);
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error(
      "BOOTH_AGENT_BASE_URL must not contain credentials, query parameters, or a fragment.",
    );
  }
  if (baseUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error(
      "Booth agent requires HTTPS except for a localhost development URL.",
    );
  }
  if (
    parsed.data.BOOTH_HEARTBEAT_TIMEOUT_SECONDS <=
    parsed.data.BOOTH_POLL_INTERVAL_SECONDS * 2
  ) {
    throw new Error(
      "BOOTH_HEARTBEAT_TIMEOUT_SECONDS must exceed at least two poll intervals.",
    );
  }
  if (parsed.data.BOOTH_PROVIDER_KEY === "photobooth_app") {
    if (!photoboothAppUrl || !parsed.data.BOOTH_PHOTOBOOTH_APP_CALLBACK_TOKEN) {
      throw new Error(
        "Photobooth-App requires BOOTH_PHOTOBOOTH_APP_URL and BOOTH_PHOTOBOOTH_APP_CALLBACK_TOKEN.",
      );
    }
    if (
      photoboothAppUrl.username ||
      photoboothAppUrl.password ||
      photoboothAppUrl.search ||
      photoboothAppUrl.hash ||
      !["localhost", "127.0.0.1", "::1"].includes(photoboothAppUrl.hostname)
    ) {
      throw new Error(
        "BOOTH_PHOTOBOOTH_APP_URL must be a loopback URL without credentials, query, or fragment.",
      );
    }
  }
  return {
    baseUrl,
    deviceId: parsed.data.BOOTH_DEVICE_ID,
    deviceToken: parsed.data.BOOTH_DEVICE_TOKEN,
    providerKey: parsed.data.BOOTH_PROVIDER_KEY,
    mockMode: parsed.data.BOOTH_MOCK_MODE,
    mockDelayMs: parsed.data.BOOTH_MOCK_DELAY_MS,
    mockCompletionDelayMs: parsed.data.BOOTH_MOCK_COMPLETION_DELAY_MS,
    ...(photoboothAppUrl ? { photoboothAppUrl } : {}),
    photoboothAppAction: parsed.data.BOOTH_PHOTOBOOTH_APP_ACTION,
    photoboothAppActionIndex: parsed.data.BOOTH_PHOTOBOOTH_APP_ACTION_INDEX,
    ...(parsed.data.BOOTH_PHOTOBOOTH_APP_CALLBACK_TOKEN
      ? {
          photoboothAppCallbackToken:
            parsed.data.BOOTH_PHOTOBOOTH_APP_CALLBACK_TOKEN,
        }
      : {}),
    photoboothAppCallbackPort: parsed.data.BOOTH_PHOTOBOOTH_APP_CALLBACK_PORT,
    pollIntervalMs: parsed.data.BOOTH_POLL_INTERVAL_SECONDS * 1000,
  };
}
