-- CreateTable
CREATE TABLE "admin_login_attempts" (
    "key" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "lockedUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_login_attempts_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "admin_login_attempts_updatedAt_idx" ON "admin_login_attempts"("updatedAt");
