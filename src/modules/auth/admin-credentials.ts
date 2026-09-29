import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const adminCredentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});

const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash() {
  dummyPasswordHash ??= bcrypt.hash("fotiu-invalid-login-dummy", 12);
  return dummyPasswordHash;
}

function getRateLimitKey(email: string) {
  return createHash("sha256").update(email).digest("hex");
}

async function isRateLimited(key: string, now: Date) {
  const attempt = await prisma.adminLoginAttempt.findUnique({
    where: { key },
    select: { windowStartedAt: true, lockedUntil: true },
  });

  if (!attempt) return false;
  if (attempt.windowStartedAt.getTime() <= now.getTime() - WINDOW_MS)
    return false;

  return attempt.lockedUntil !== null && attempt.lockedUntil > now;
}

async function recordFailure(key: string, now: Date) {
  const windowExpiredBefore = new Date(now.getTime() - WINDOW_MS);
  const lockedUntil = new Date(now.getTime() + LOCKOUT_MS);

  await prisma.$executeRaw`
    INSERT INTO "admin_login_attempts" (
      "key", "failureCount", "windowStartedAt", "lockedUntil", "updatedAt"
    ) VALUES (${key}, 1, ${now}, NULL, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "windowStartedAt" = CASE
        WHEN "admin_login_attempts"."windowStartedAt" <= ${windowExpiredBefore} THEN ${now}
        ELSE "admin_login_attempts"."windowStartedAt"
      END,
      "failureCount" = CASE
        WHEN "admin_login_attempts"."windowStartedAt" <= ${windowExpiredBefore} THEN 1
        ELSE "admin_login_attempts"."failureCount" + 1
      END,
      "lockedUntil" = CASE
        WHEN "admin_login_attempts"."windowStartedAt" <= ${windowExpiredBefore} THEN NULL
        WHEN "admin_login_attempts"."failureCount" + 1 >= ${MAX_FAILURES} THEN ${lockedUntil}
        ELSE "admin_login_attempts"."lockedUntil"
      END,
      "updatedAt" = ${now}
  `;

  await prisma.adminLoginAttempt.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
  });
}

export async function authorizeAdmin(credentials: unknown) {
  const parsed = adminCredentialsSchema.safeParse(credentials);

  if (!parsed.success) return null;

  const email = parsed.data.email.trim().toLowerCase();
  const key = getRateLimitKey(email);
  const now = new Date();
  const limited = await isRateLimited(key, now);

  if (limited) {
    await bcrypt.compare(parsed.data.password, await getDummyPasswordHash());
    return null;
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  const passwordHash = admin?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await bcrypt.compare(
    parsed.data.password,
    passwordHash,
  );

  if (!admin || !admin.isActive || !passwordMatches) {
    await recordFailure(key, now);
    logger.warn("auth.admin_login_failed", { emailKey: key });
    return null;
  }

  await prisma.adminLoginAttempt.deleteMany({ where: { key } });

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: "ADMIN" as const,
  };
}
