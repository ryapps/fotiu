CREATE TYPE "PhotoSessionStatus" AS ENUM (
  'READY', 'STARTING', 'ACTIVE', 'PROCESSING', 'COMPLETED', 'FAILED'
);
CREATE TYPE "PhotoSessionCompletionSource" AS ENUM (
  'PROVIDER_EVENT', 'MANUAL_RECOVERY'
);
CREATE TYPE "BoothCommandType" AS ENUM ('START_SESSION');
CREATE TYPE "BoothCommandStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'
);
CREATE TYPE "BoothEventType" AS ENUM (
  'SESSION_STARTED', 'SESSION_COMPLETED', 'SESSION_FAILED'
);

ALTER TABLE "bookings"
  ADD COLUMN "checkedInAt" TIMESTAMPTZ(3),
  ADD COLUMN "checkedInByAdminId" TEXT;

CREATE TABLE "booths" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "providerKey" VARCHAR(40) NOT NULL,
  "agentTokenHash" TEXT NOT NULL,
  "isMaintenance" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "booths_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booths_name_nonempty_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "booths_device_id_nonempty_check" CHECK (length(btrim("deviceId")) > 0),
  CONSTRAINT "booths_provider_key_format_check" CHECK ("providerKey" ~ '^[a-z0-9][a-z0-9_-]{0,39}$')
);

CREATE TABLE "photo_sessions" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "providerKey" VARCHAR(40) NOT NULL,
  "providerSessionId" TEXT,
  "status" "PhotoSessionStatus" NOT NULL DEFAULT 'READY',
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "completionSource" "PhotoSessionCompletionSource",
  "completionReason" TEXT,
  "completedByAdminId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "photo_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "photo_sessions_provider_key_format_check" CHECK ("providerKey" ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  CONSTRAINT "photo_sessions_completed_timestamp_check" CHECK ("completedAt" IS NULL OR "status" = 'COMPLETED'),
  CONSTRAINT "photo_sessions_failed_timestamp_check" CHECK ("failedAt" IS NULL OR "status" = 'FAILED'),
  CONSTRAINT "photo_sessions_terminal_timestamp_required_check" CHECK (
    ("status" <> 'COMPLETED' OR ("completedAt" IS NOT NULL AND "completionSource" IS NOT NULL)) AND
    ("status" <> 'FAILED' OR "failedAt" IS NOT NULL)
  ),
  CONSTRAINT "photo_sessions_started_timestamp_required_check" CHECK (
    "status" NOT IN ('ACTIVE', 'PROCESSING', 'COMPLETED') OR "startedAt" IS NOT NULL
  ),
  CONSTRAINT "photo_sessions_completion_metadata_check" CHECK (
    ("completionSource" IS NULL OR "status" = 'COMPLETED') AND
    ("completionSource" <> 'MANUAL_RECOVERY' OR
      ("completedByAdminId" IS NOT NULL AND "completionReason" IS NOT NULL AND length(btrim("completionReason")) > 0)) AND
    ("completionSource" <> 'PROVIDER_EVENT' OR
      ("completedByAdminId" IS NULL AND "completionReason" IS NULL))
  )
);

CREATE TABLE "booth_commands" (
  "id" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "photoSessionId" TEXT NOT NULL,
  "type" "BoothCommandType" NOT NULL,
  "status" "BoothCommandStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executedAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "errorMessage" TEXT,
  CONSTRAINT "booth_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booth_commands_terminal_timestamp_check" CHECK (
    ("executedAt" IS NULL OR "status" = 'SUCCESS') AND
    ("failedAt" IS NULL OR "status" = 'FAILED') AND
    ("status" <> 'SUCCESS' OR "executedAt" IS NOT NULL) AND
    ("status" <> 'FAILED' OR "failedAt" IS NOT NULL)
  )
);

CREATE TABLE "booth_events" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "photoSessionId" TEXT NOT NULL,
  "type" "BoothEventType" NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booth_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booths_deviceId_key" ON "booths"("deviceId");
CREATE UNIQUE INDEX "booths_agentTokenHash_key" ON "booths"("agentTokenHash");
CREATE INDEX "booths_lastSeenAt_idx" ON "booths"("lastSeenAt");
CREATE UNIQUE INDEX "photo_sessions_id_boothId_key" ON "photo_sessions"("id", "boothId");
CREATE INDEX "photo_sessions_bookingId_createdAt_idx" ON "photo_sessions"("bookingId", "createdAt");
CREATE INDEX "photo_sessions_boothId_status_createdAt_idx" ON "photo_sessions"("boothId", "status", "createdAt");
CREATE UNIQUE INDEX "photo_sessions_one_active_per_booth" ON "photo_sessions"("boothId")
  WHERE "status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING');
CREATE UNIQUE INDEX "photo_sessions_one_active_per_booking" ON "photo_sessions"("bookingId")
  WHERE "status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING');
CREATE UNIQUE INDEX "booth_commands_idempotencyKey_key" ON "booth_commands"("idempotencyKey");
CREATE UNIQUE INDEX "booth_commands_one_type_per_session_key" ON "booth_commands"("photoSessionId", "type");
CREATE INDEX "booth_commands_boothId_status_createdAt_idx" ON "booth_commands"("boothId", "status", "createdAt");
CREATE UNIQUE INDEX "booth_events_eventId_key" ON "booth_events"("eventId");
CREATE INDEX "booth_events_photoSessionId_occurredAt_idx" ON "booth_events"("photoSessionId", "occurredAt");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkedInByAdminId_fkey"
  FOREIGN KEY ("checkedInByAdminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "photo_sessions" ADD CONSTRAINT "photo_sessions_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "photo_sessions" ADD CONSTRAINT "photo_sessions_boothId_fkey"
  FOREIGN KEY ("boothId") REFERENCES "booths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "photo_sessions" ADD CONSTRAINT "photo_sessions_completedByAdminId_fkey"
  FOREIGN KEY ("completedByAdminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booth_commands" ADD CONSTRAINT "booth_commands_boothId_fkey"
  FOREIGN KEY ("boothId") REFERENCES "booths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booth_commands" ADD CONSTRAINT "booth_commands_photoSessionId_boothId_fkey"
  FOREIGN KEY ("photoSessionId", "boothId") REFERENCES "photo_sessions"("id", "boothId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booth_events" ADD CONSTRAINT "booth_events_boothId_fkey"
  FOREIGN KEY ("boothId") REFERENCES "booths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booth_events" ADD CONSTRAINT "booth_events_photoSessionId_boothId_fkey"
  FOREIGN KEY ("photoSessionId", "boothId") REFERENCES "photo_sessions"("id", "boothId") ON DELETE RESTRICT ON UPDATE CASCADE;
