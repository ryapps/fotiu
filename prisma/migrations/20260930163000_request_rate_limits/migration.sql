CREATE TABLE "rate_limit_buckets" (
  "key" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rate_limit_buckets_updatedAt_idx"
  ON "rate_limit_buckets"("updatedAt");
