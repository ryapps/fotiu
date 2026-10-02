import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const CUSTOMER_ACTION_LIMITS = {
  createBooking: { limit: 10, windowMs: 60_000 },
  createPayment: { limit: 5, windowMs: 15 * 60_000 },
} as const;

export function rateLimitStorageKey(action: string, subjectId: string) {
  return createHash("sha256").update(`${action}:${subjectId}`).digest("hex");
}

export async function consumeRateLimit(
  action: keyof typeof CUSTOMER_ACTION_LIMITS,
  subjectId: string,
  now = new Date(),
) {
  const { limit, windowMs } = CUSTOMER_ACTION_LIMITS[action];
  const key = rateLimitStorageKey(action, subjectId);
  const cutoff = new Date(now.getTime() - windowMs);

  await prisma.$executeRaw`
    DELETE FROM "rate_limit_buckets" WHERE "updatedAt" < ${new Date(now.getTime() - 24 * 60 * 60_000)}
  `;
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "rate_limit_buckets" ("key", "windowStartedAt", "count", "updatedAt")
    VALUES (${key}, ${now}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "windowStartedAt" = CASE
        WHEN "rate_limit_buckets"."windowStartedAt" <= ${cutoff} THEN ${now}
        ELSE "rate_limit_buckets"."windowStartedAt"
      END,
      "count" = CASE
        WHEN "rate_limit_buckets"."windowStartedAt" <= ${cutoff} THEN 1
        ELSE "rate_limit_buckets"."count" + 1
      END,
      "updatedAt" = ${now}
    RETURNING "count"
  `;
  return rows[0].count <= limit;
}
