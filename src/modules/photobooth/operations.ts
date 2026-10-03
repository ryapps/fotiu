import "server-only";

import { randomUUID } from "node:crypto";
import { BookingStatus, Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { isWithinPhotoSessionWindow } from "@/modules/scheduling/session-duration";
import { prisma } from "@/lib/prisma";
import { getBoothReadStatus } from "@/modules/photobooth/domain";
import { transitionBooking } from "@/modules/booking/state-machine";

type OperationResult =
  | {
      ok: true;
      photoSessionId?: string;
      bookingId?: string;
      commandStatus?: string;
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "INVALID_STATE"
        | "OUTSIDE_SCHEDULE"
        | "ALREADY_CHECKED_IN"
        | "BOOTH_UNAVAILABLE"
        | "SESSION_ACTIVE"
        | "SESSION_NOT_COMPLETED"
        | "SESSION_NOT_ACTIVE"
        | "SESSION_FAILED"
        | "INVALID_INPUT"
        | "INVALID_TRANSITION"
        | "CONFLICT";
    };

export async function checkInBooking(input: {
  bookingId: string;
  adminId: string;
  now?: Date;
}): Promise<OperationResult> {
  const now = input.now ?? new Date();
  return prisma.$transaction(
    async (tx) => {
      const bookings = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          startAt: Date;
          endAt: Date;
          checkedInAt: Date | null;
        }>
      >`SELECT "id", "status", "startAt", "endAt", "checkedInAt" FROM "bookings" WHERE "id" = ${input.bookingId} FOR UPDATE`;
      const booking = bookings[0];
      if (!booking) return { ok: false, code: "NOT_FOUND" };
      if (booking.status !== "CONFIRMED")
        return { ok: false, code: "INVALID_STATE" };
      if (booking.checkedInAt) return { ok: false, code: "ALREADY_CHECKED_IN" };
      if (!isWithinPhotoSessionWindow(now, booking.startAt, booking.endAt))
        return { ok: false, code: "OUTSIDE_SCHEDULE" };

      const payments = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "payments" WHERE "bookingId" = ${booking.id} FOR UPDATE
    `;
      if (payments[0]?.status !== "PAID")
        return { ok: false, code: "INVALID_STATE" };

      const updated = await tx.$executeRaw`
      UPDATE "bookings" SET "checkedInAt" = ${now}, "checkedInByAdminId" = ${input.adminId}, "updatedAt" = ${now}
      WHERE "id" = ${booking.id} AND "status" = 'CONFIRMED' AND "checkedInAt" IS NULL
    `;
      return updated === 1
        ? { ok: true }
        : { ok: false, code: "ALREADY_CHECKED_IN" };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}

export async function assignBooth(input: {
  bookingId: string;
  boothId: string;
  now?: Date;
}): Promise<OperationResult> {
  const now = input.now ?? new Date();
  try {
    return await prisma.$transaction(
      async (tx) => {
        const bookings = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            startAt: Date;
            endAt: Date;
            checkedInAt: Date | null;
          }>
        >`SELECT "id", "status", "startAt", "endAt", "checkedInAt" FROM "bookings" WHERE "id" = ${input.bookingId} FOR UPDATE`;
        const booking = bookings[0];
        if (!booking) return { ok: false, code: "NOT_FOUND" };
        if (
          booking.status !== "CONFIRMED" ||
          !booking.checkedInAt ||
          !isWithinPhotoSessionWindow(now, booking.startAt, booking.endAt)
        ) {
          return { ok: false, code: "INVALID_STATE" };
        }
        const payments = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "payments" WHERE "bookingId" = ${booking.id} FOR UPDATE
      `;
        if (payments[0]?.status !== "PAID")
          return { ok: false, code: "INVALID_STATE" };

        const booths = await tx.$queryRaw<
          Array<{
            id: string;
            providerKey: string;
            isMaintenance: boolean;
            lastSeenAt: Date | null;
          }>
        >`SELECT "id", "providerKey", "isMaintenance", "lastSeenAt" FROM "booths" WHERE "id" = ${input.boothId} FOR UPDATE`;
        const booth = booths[0];
        if (!booth) return { ok: false, code: "NOT_FOUND" };

        const active = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "photo_sessions"
        WHERE "status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')
          AND ("boothId" = ${booth.id} OR "bookingId" = ${booking.id})
        LIMIT 1
      `;
        if (active.length) return { ok: false, code: "SESSION_ACTIVE" };
        const status = getBoothReadStatus({
          isMaintenance: booth.isMaintenance,
          lastSeenAt: booth.lastSeenAt,
          hasActiveSession: false,
          now,
          heartbeatTimeoutSeconds: env.BOOTH_HEARTBEAT_TIMEOUT_SECONDS,
        });
        if (status !== "ONLINE")
          return { ok: false, code: "BOOTH_UNAVAILABLE" };

        const photoSessionId = randomUUID();
        await tx.$executeRaw`
        INSERT INTO "photo_sessions" ("id", "bookingId", "boothId", "providerKey", "status", "createdAt", "updatedAt")
        VALUES (${photoSessionId}, ${booking.id}, ${booth.id}, ${booth.providerKey}, 'READY', ${now}, ${now})
      `;
        return { ok: true, photoSessionId };
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const postgresCode = String(error.meta?.code ?? "");
      const details = String(error.meta?.message ?? error.message);
      if (
        error.code === "P2002" ||
        (error.code === "P2010" && postgresCode === "23505") ||
        details.includes("photo_sessions_one_active_per_")
      ) {
        return { ok: false, code: "CONFLICT" };
      }
    }
    throw error;
  }
}

export async function setBoothMaintenance(input: {
  boothId: string;
  enabled: boolean;
}): Promise<OperationResult> {
  return prisma.$transaction(
    async (tx) => {
      const booths = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "booths" WHERE "id" = ${input.boothId} FOR UPDATE
    `;
      if (!booths[0]) return { ok: false, code: "NOT_FOUND" };
      if (!input.enabled) {
        const activeSessions = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "photo_sessions"
        WHERE "boothId" = ${input.boothId}
          AND "status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')
        LIMIT 1
      `;
        if (activeSessions.length) return { ok: false, code: "SESSION_ACTIVE" };
      }
      await tx.$executeRaw`
      UPDATE "booths" SET "isMaintenance" = ${input.enabled}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.boothId}
    `;
      return { ok: true };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}

export async function startPhotoSession(input: {
  photoSessionId: string;
  bookingId: string;
  now?: Date;
}): Promise<OperationResult> {
  const now = input.now ?? new Date();
  try {
    return await prisma.$transaction(
      async (tx) => {
        const owners = await tx.$queryRaw<
          Array<{ bookingId: string; boothId: string; providerKey: string }>
        >`SELECT "bookingId", "boothId", "providerKey" FROM "photo_sessions" WHERE "id" = ${input.photoSessionId}`;
        const owner = owners[0];
        if (!owner || owner.bookingId !== input.bookingId)
          return { ok: false, code: "NOT_FOUND" };

        const bookings = await tx.$queryRaw<
          Array<{
            status: string;
            startAt: Date;
            endAt: Date;
            checkedInAt: Date | null;
          }>
        >`SELECT "status", "startAt", "endAt", "checkedInAt" FROM "bookings" WHERE "id" = ${owner.bookingId} FOR UPDATE`;
        const booking = bookings[0];
        if (!booking) return { ok: false, code: "NOT_FOUND" };
        if (
          booking.status !== "CONFIRMED" ||
          !booking.checkedInAt ||
          !isWithinPhotoSessionWindow(now, booking.startAt, booking.endAt)
        ) {
          return { ok: false, code: "INVALID_STATE" };
        }
        const payments = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "payments" WHERE "bookingId" = ${owner.bookingId} FOR UPDATE
      `;
        if (payments[0]?.status !== "PAID")
          return { ok: false, code: "INVALID_STATE" };
        const sessions = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "photo_sessions" WHERE "id" = ${input.photoSessionId} FOR UPDATE
      `;
        const session = sessions[0];
        if (!session) return { ok: false, code: "NOT_FOUND" };
        if (session.status === "STARTING") {
          const commands = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT "status" FROM "booth_commands"
          WHERE "photoSessionId" = ${input.photoSessionId} AND "type" = 'START_SESSION'
        `;
          if (!commands[0]) return { ok: false, code: "INVALID_TRANSITION" };
          return {
            ok: true,
            photoSessionId: input.photoSessionId,
            bookingId: owner.bookingId,
            commandStatus: commands[0].status,
          };
        }
        if (session.status !== "READY")
          return { ok: false, code: "INVALID_TRANSITION" };

        const booths = await tx.$queryRaw<
          Array<{
            isMaintenance: boolean;
            lastSeenAt: Date | null;
          }>
        >`SELECT "isMaintenance", "lastSeenAt" FROM "booths" WHERE "id" = ${owner.boothId} FOR UPDATE`;
        const booth = booths[0];
        if (!booth) return { ok: false, code: "NOT_FOUND" };

        const otherActiveSessions = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "photo_sessions"
        WHERE "boothId" = ${owner.boothId} AND "id" <> ${input.photoSessionId}
          AND "status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')
        LIMIT 1
      `;
        if (otherActiveSessions.length)
          return { ok: false, code: "SESSION_ACTIVE" };
        const boothStatus = getBoothReadStatus({
          isMaintenance: booth.isMaintenance,
          lastSeenAt: booth.lastSeenAt,
          // The READY session reserves its own booth; only another active session blocks start.
          hasActiveSession: false,
          now,
          heartbeatTimeoutSeconds: env.BOOTH_HEARTBEAT_TIMEOUT_SECONDS,
        });
        if (boothStatus !== "ONLINE")
          return { ok: false, code: "BOOTH_UNAVAILABLE" };

        if (owner.providerKey === "freebooth") {
          const updated = await tx.$executeRaw`
            UPDATE "photo_sessions" SET "status" = 'ACTIVE', "startedAt" = ${now}, "updatedAt" = ${now}
            WHERE "id" = ${input.photoSessionId} AND "status" = 'READY'
          `;
          if (updated !== 1) return { ok: false, code: "INVALID_TRANSITION" };
          return {
            ok: true,
            photoSessionId: input.photoSessionId,
            bookingId: owner.bookingId,
            commandStatus: "MANUAL",
          };
        }

        const idempotencyKey = `start:${input.photoSessionId}`;
        const commandId = randomUUID();
        await tx.$executeRaw`
        UPDATE "photo_sessions" SET "status" = 'STARTING', "updatedAt" = ${now}
        WHERE "id" = ${input.photoSessionId} AND "status" = 'READY'
      `;
        await tx.$executeRaw`
        INSERT INTO "booth_commands" ("id", "boothId", "photoSessionId", "type", "status", "idempotencyKey", "createdAt")
        VALUES (${commandId}, ${owner.boothId}, ${input.photoSessionId}, 'START_SESSION', 'PENDING', ${idempotencyKey}, ${now})
      `;
        return {
          ok: true,
          photoSessionId: input.photoSessionId,
          bookingId: owner.bookingId,
          commandStatus: "PENDING",
        };
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const postgresCode = String(error.meta?.code ?? "");
      if (
        error.code === "P2002" ||
        (error.code === "P2010" && postgresCode === "23505")
      ) {
        return { ok: false, code: "CONFLICT" };
      }
    }
    throw error;
  }
}

export async function completeBookingAsAdmin(input: {
  bookingId: string;
  adminId: string;
  reason?: string;
  now?: Date;
}): Promise<OperationResult> {
  const now = input.now ?? new Date();
  return prisma.$transaction(
    async (tx) => {
      const bookings = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          startAt: Date;
          checkedInAt: Date | null;
        }>
      >`SELECT "id", "status", "startAt", "checkedInAt" FROM "bookings" WHERE "id" = ${input.bookingId} FOR UPDATE`;
      const booking = bookings[0];
      if (!booking) return { ok: false, code: "NOT_FOUND" };
      if (booking.status !== "CONFIRMED")
        return { ok: false, code: "INVALID_STATE" };
      if (now < booking.startAt) return { ok: false, code: "OUTSIDE_SCHEDULE" };
      if (!booking.checkedInAt) return { ok: false, code: "INVALID_STATE" };

      const payments = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "payments" WHERE "bookingId" = ${booking.id} FOR UPDATE
      `;
      if (payments[0]?.status !== "PAID")
        return { ok: false, code: "INVALID_STATE" };

      const sessions = await tx.$queryRaw<
        Array<{ id: string; status: string; completedAt: Date | null }>
      >`
        SELECT "id", "status", "completedAt" FROM "photo_sessions"
        WHERE "bookingId" = ${booking.id}
        ORDER BY "createdAt" DESC, "id" DESC
        FOR UPDATE
      `;
      const completedSession = sessions.find(
        (session) => session.status === "COMPLETED",
      );
      if (completedSession) {
        const transitioned = await transitionBooking(
          tx,
          booking.id,
          BookingStatus.CONFIRMED,
          BookingStatus.COMPLETED,
          { completedAt: completedSession.completedAt ?? now },
        );
        return transitioned
          ? { ok: true, photoSessionId: completedSession.id }
          : { ok: false, code: "INVALID_TRANSITION" };
      }

      const activeSession = sessions.find((session) =>
        ["STARTING", "ACTIVE", "PROCESSING"].includes(session.status),
      );
      if (input.reason !== undefined) {
        if (input.reason.trim().length < 3)
          return { ok: false, code: "INVALID_INPUT" };
        if (!activeSession)
          return {
            ok: false,
            code: sessions.some((session) => session.status === "FAILED")
              ? "SESSION_FAILED"
              : "SESSION_NOT_ACTIVE",
          };
        const updated = await tx.$executeRaw`
          UPDATE "photo_sessions"
          SET "status" = 'COMPLETED', "startedAt" = COALESCE("startedAt", ${now}),
            "completedAt" = ${now},
            "completionSource" = 'MANUAL_RECOVERY', "completionReason" = ${input.reason.trim()},
            "completedByAdminId" = ${input.adminId}, "updatedAt" = ${now}
          WHERE "id" = ${activeSession.id} AND "status" IN ('STARTING', 'ACTIVE', 'PROCESSING')
        `;
        if (updated !== 1) return { ok: false, code: "INVALID_TRANSITION" };
        await tx.$executeRaw`
          UPDATE "booth_commands"
          SET "status" = 'FAILED', "failedAt" = ${now},
            "errorMessage" = 'Cancelled by verified manual session recovery'
          WHERE "photoSessionId" = ${activeSession.id} AND "status" = 'PENDING'
        `;
        const transitioned = await transitionBooking(
          tx,
          booking.id,
          BookingStatus.CONFIRMED,
          BookingStatus.COMPLETED,
          { completedAt: now },
        );
        if (!transitioned)
          throw new Error(
            "Booking state changed while applying manual recovery.",
          );
        return { ok: true, photoSessionId: activeSession.id };
      }

      if (activeSession) return { ok: false, code: "SESSION_NOT_COMPLETED" };
      if (sessions.some((session) => session.status === "FAILED"))
        return { ok: false, code: "SESSION_FAILED" };
      return { ok: false, code: "SESSION_NOT_COMPLETED" };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}
