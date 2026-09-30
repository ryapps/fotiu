import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { allowAgentRequest } from "@/modules/photobooth/agent-rate-limit";
import { parseAgentJson } from "@/modules/photobooth/agent-payload";
import { authenticateBoothDevice } from "@/modules/photobooth/device-auth";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  eventId: z.string().trim().min(8).max(128),
  photoSessionId: z.string().trim().min(1).max(64),
  type: z.enum(["SESSION_STARTED", "SESSION_COMPLETED", "SESSION_FAILED"]),
  occurredAt: z.iso.datetime({ offset: true }),
});

export async function POST(request: Request) {
  const booth = await authenticateBoothDevice(request);
  if (!booth)
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401 },
    );
  if (!allowAgentRequest(`${booth.id}:events`, 120)) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  const parsed = await parseAgentJson(request, eventSchema);
  if (!parsed.ok)
    return NextResponse.json(
      { ok: false, code: parsed.code },
      { status: parsed.status },
    );
  const now = new Date();
  const occurredAt = new Date(parsed.data.occurredAt);
  if (occurredAt.getTime() > now.getTime() + 5 * 60_000) {
    return NextResponse.json(
      { ok: false, code: "INVALID_TIMESTAMP" },
      { status: 400 },
    );
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const owner = await tx.$queryRaw<Array<{ bookingId: string }>>`
      SELECT "bookingId" FROM "photo_sessions" WHERE "id" = ${parsed.data.photoSessionId} AND "boothId" = ${booth.id}
    `;
      if (!owner[0]) return { ok: false as const, code: "NOT_FOUND" as const };
      const bookings = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "bookings" WHERE "id" = ${owner[0].bookingId} FOR UPDATE
    `;
      if (bookings.length === 0)
        return { ok: false as const, code: "NOT_FOUND" as const };
      const sessions = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          createdAt: Date;
          bookingStatus: string;
          startAt: Date;
          paymentStatus: string | null;
        }>
      >`
      SELECT session."id", session."status", session."createdAt", booking."status" AS "bookingStatus",
        booking."startAt", payment."status" AS "paymentStatus"
      FROM "photo_sessions" session
      JOIN "bookings" booking ON booking."id" = session."bookingId"
      LEFT JOIN "payments" payment ON payment."bookingId" = booking."id"
      WHERE session."id" = ${parsed.data.photoSessionId} AND session."boothId" = ${booth.id}
      FOR UPDATE OF session
    `;
      const session = sessions[0];
      if (!session) return { ok: false as const, code: "NOT_FOUND" as const };
      if (occurredAt.getTime() < session.createdAt.getTime() - 60_000) {
        return { ok: false as const, code: "INVALID_TIMESTAMP" as const };
      }

      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "booth_events" ("id", "eventId", "boothId", "photoSessionId", "type", "occurredAt", "receivedAt")
      VALUES (${randomUUID()}, ${parsed.data.eventId}, ${booth.id}, ${session.id}, ${parsed.data.type}, ${occurredAt}, ${now})
      ON CONFLICT ("eventId") DO NOTHING
      RETURNING "id"
    `;
      if (inserted.length === 0) {
        const previous = await tx.$queryRaw<
          Array<{ boothId: string; photoSessionId: string; type: string }>
        >`
        SELECT "boothId", "photoSessionId", "type" FROM "booth_events" WHERE "eventId" = ${parsed.data.eventId}
      `;
        if (
          previous[0]?.boothId === booth.id &&
          previous[0]?.photoSessionId === session.id &&
          previous[0]?.type === parsed.data.type
        ) {
          return { ok: true as const, duplicate: true };
        }
        return { ok: false as const, code: "EVENT_ID_CONFLICT" as const };
      }

      if (
        parsed.data.type === "SESSION_STARTED" &&
        session.status === "STARTING"
      ) {
        await tx.$executeRaw`UPDATE "photo_sessions" SET "status" = 'ACTIVE', "startedAt" = ${now}, "updatedAt" = ${now} WHERE "id" = ${session.id} AND "status" = 'STARTING'`;
        return { ok: true as const, duplicate: false };
      }

      if (
        parsed.data.type === "SESSION_COMPLETED" &&
        ["ACTIVE", "PROCESSING"].includes(session.status)
      ) {
        await tx.$executeRaw`UPDATE "photo_sessions" SET "status" = 'COMPLETED', "completedAt" = ${now}, "completionSource" = 'PROVIDER_EVENT', "updatedAt" = ${now} WHERE "id" = ${session.id} AND "status" IN ('ACTIVE', 'PROCESSING')`;
        if (
          session.bookingStatus === "CONFIRMED" &&
          session.paymentStatus === "PAID" &&
          now >= session.startAt
        ) {
          await tx.$executeRaw`UPDATE "bookings" SET "status" = 'COMPLETED', "completedAt" = ${now}, "updatedAt" = ${now} WHERE "id" = ${owner[0].bookingId} AND "status" = 'CONFIRMED' AND "startAt" <= ${now}`;
        }
        return { ok: true as const, duplicate: false };
      }

      if (
        parsed.data.type === "SESSION_FAILED" &&
        ["STARTING", "ACTIVE", "PROCESSING"].includes(session.status)
      ) {
        await tx.$executeRaw`UPDATE "photo_sessions" SET "status" = 'FAILED', "failedAt" = ${now}, "updatedAt" = ${now} WHERE "id" = ${session.id} AND "status" IN ('STARTING', 'ACTIVE', 'PROCESSING')`;
        await tx.$executeRaw`UPDATE "booths" SET "isMaintenance" = true, "updatedAt" = ${now} WHERE "id" = ${booth.id}`;
        return { ok: true as const, duplicate: false };
      }

      return { ok: true as const, duplicate: false, ignored: true };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );

  if (!result.ok)
    return NextResponse.json(result, {
      status:
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "INVALID_TIMESTAMP"
            ? 400
            : 409,
    });
  return NextResponse.json(result);
}
