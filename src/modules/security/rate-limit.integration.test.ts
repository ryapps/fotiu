import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { consumeRateLimit, rateLimitStorageKey } from "@/modules/security/rate-limit";

const subject = randomUUID();
const key = rateLimitStorageKey("createPayment", subject);

describe("database rate limit under PostgreSQL concurrency", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "key" = ${key}`;
    await prisma.$disconnect();
  });

  it("allows only the configured number of concurrent actions and resets the window", async () => {
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 24 }, () => consumeRateLimit("createPayment", subject, now)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(results.filter((allowed) => !allowed)).toHaveLength(19);

    expect(await consumeRateLimit(
      "createPayment",
      subject,
      new Date(now.getTime() + 16 * 60_000),
    )).toBe(true);
  });
});
