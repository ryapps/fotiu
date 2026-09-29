import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  DIRECT_URL: z.string().url().startsWith("postgresql://").optional(),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  STUDIO_TIMEZONE: z.string().default("Asia/Jakarta"),
}).superRefine((value, context) => {
  if (Boolean(value.AUTH_GOOGLE_ID) !== Boolean(value.AUTH_GOOGLE_SECRET)) {
    context.addIssue({
      code: "custom",
      path: ["AUTH_GOOGLE_SECRET"],
      message: "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set together.",
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
