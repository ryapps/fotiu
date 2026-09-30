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
  return {
    baseUrl,
    deviceId: parsed.data.BOOTH_DEVICE_ID,
    deviceToken: parsed.data.BOOTH_DEVICE_TOKEN,
    providerKey: parsed.data.BOOTH_PROVIDER_KEY,
    mockMode: parsed.data.BOOTH_MOCK_MODE,
    mockDelayMs: parsed.data.BOOTH_MOCK_DELAY_MS,
    mockCompletionDelayMs: parsed.data.BOOTH_MOCK_COMPLETION_DELAY_MS,
    pollIntervalMs: parsed.data.BOOTH_POLL_INTERVAL_SECONDS * 1000,
  };
}
