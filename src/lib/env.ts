import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().url().startsWith("postgresql://"),
    DIRECT_URL: z.string().url().startsWith("postgresql://").optional(),
    AUTH_SECRET: z.string().min(32),
    AUTH_GOOGLE_ID: z.string().min(1).optional(),
    AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
    APP_URL: z.string().url().default("http://localhost:3000"),
    STUDIO_TIMEZONE: z.string().default("Asia/Jakarta"),
    STUDIO_ADDRESS: z.string().trim().min(1).optional(),
    STUDIO_CONTACT: z.string().trim().min(1).optional(),
    MIN_LEAD_HOURS: z.coerce.number().int().min(0).default(2),
    MAX_ADVANCE_DAYS: z.coerce.number().int().positive().default(60),
    BOOKING_HOLD_MINUTES: z.coerce.number().int().positive().default(15),
    MAX_ACTIVE_HOLDS_PER_USER: z.coerce.number().int().positive().default(2),
    CUSTOMER_CANCEL_DEADLINE_HOURS: z.coerce.number().int().min(0).default(24),
    CRON_SECRET: z.string().min(32).optional(),
    MIDTRANS_SERVER_KEY: z.string().min(1).optional(),
    MIDTRANS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    STORAGE_ENDPOINT: z.string().url().optional(),
    STORAGE_REGION: z.string().min(1).optional(),
    STORAGE_BUCKET: z.string().min(1).optional(),
    STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    STORAGE_PUBLIC_URL: z.string().url().optional(),
    BOOTH_HEARTBEAT_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .min(10)
      .max(3600)
      .default(45),
  })
  .superRefine((value, context) => {
    if (Boolean(value.AUTH_GOOGLE_ID) !== Boolean(value.AUTH_GOOGLE_SECRET)) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_GOOGLE_SECRET"],
        message: "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set together.",
      });
    }

    const storageValues = [
      value.STORAGE_ENDPOINT,
      value.STORAGE_REGION,
      value.STORAGE_BUCKET,
      value.STORAGE_ACCESS_KEY_ID,
      value.STORAGE_SECRET_ACCESS_KEY,
      value.STORAGE_PUBLIC_URL,
    ];
    if (storageValues.some(Boolean) && storageValues.some((item) => !item)) {
      context.addIssue({
        code: "custom",
        path: ["STORAGE_ENDPOINT"],
        message: "All STORAGE_* settings must be set together.",
      });
    }

    try {
      new Intl.DateTimeFormat("en", { timeZone: value.STUDIO_TIMEZONE });
    } catch {
      context.addIssue({
        code: "custom",
        path: ["STUDIO_TIMEZONE"],
        message: "Must be a valid IANA time zone.",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsed.data;
