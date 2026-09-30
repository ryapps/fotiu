import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { allowAgentRequest } from "@/modules/photobooth/agent-rate-limit";
import { authenticateBoothDevice } from "@/modules/photobooth/device-auth";

export const dynamic = "force-dynamic";

type ActiveSession = {
  photoSessionId: string;
  providerSessionId: string | null;
  status: "STARTING" | "ACTIVE" | "PROCESSING";
};

async function getActiveSessions(
  tx: Prisma.TransactionClient,
  boothId: string,
) {
  return tx.$queryRaw<ActiveSession[]>`
    SELECT "id" AS "photoSessionId", "providerSessionId", "status"
    FROM "photo_sessions"
    WHERE "boothId" = ${boothId}
      AND "status" IN ('STARTING', 'ACTIVE', 'PROCESSING')
    ORDER BY "createdAt" ASC
  `;
}

export async function GET(request: Request) {
  const booth = await authenticateBoothDevice(request);
  if (!booth)
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401 },
    );
  if (!allowAgentRequest(`${booth.id}:commands`, 30)) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const commands = await tx.$queryRaw<
        Array<{
          id: string;
          photoSessionId: string;
          idempotencyKey: string;
          type: "START_SESSION";
          sessionStatus: string;
          bookingStatus: string;
          paymentStatus: string | null;
        }>
      >`
      SELECT command."id", command."photoSessionId", command."idempotencyKey", command."type",
        session."status" AS "sessionStatus", booking."status" AS "bookingStatus", payment."status" AS "paymentStatus"
      FROM "booth_commands" AS command
      JOIN "photo_sessions" AS session ON session."id" = command."photoSessionId" AND session."boothId" = command."boothId"
      JOIN "bookings" AS booking ON booking."id" = session."bookingId"
      LEFT JOIN "payments" AS payment ON payment."bookingId" = booking."id"
      WHERE command."boothId" = ${booth.id} AND command."status" = 'PENDING'
      ORDER BY command."createdAt" ASC
      LIMIT 1
      FOR UPDATE OF command SKIP LOCKED
    `;
      const candidate = commands[0];
      let claimedCommand: null | {
        id: string;
        photoSessionId: string;
        idempotencyKey: string;
        type: "START_SESSION";
      } = null;
      if (candidate) {
        const eligible =
          candidate.type === "START_SESSION" &&
          candidate.sessionStatus === "STARTING" &&
          candidate.bookingStatus === "CONFIRMED" &&
          candidate.paymentStatus === "PAID";
        if (!eligible) {
          await tx.$executeRaw`UPDATE "booth_commands" SET "status" = 'FAILED', "failedAt" = CURRENT_TIMESTAMP, "errorMessage" = 'Booking is no longer eligible' WHERE "id" = ${candidate.id} AND "status" = 'PENDING'`;
          await tx.$executeRaw`UPDATE "photo_sessions" SET "status" = 'FAILED', "failedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${candidate.photoSessionId} AND "status" = 'STARTING'`;
        } else {
          const updated =
            await tx.$executeRaw`UPDATE "booth_commands" SET "status" = 'PROCESSING' WHERE "id" = ${candidate.id} AND "status" = 'PENDING'`;
          if (updated === 1) {
            claimedCommand = {
              id: candidate.id,
              photoSessionId: candidate.photoSessionId,
              idempotencyKey: candidate.idempotencyKey,
              type: candidate.type,
            };
          }
        }
      }
      const activeSessions = await getActiveSessions(tx, booth.id);
      return { command: claimedCommand, activeSessions };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );

  return NextResponse.json({ ok: true, ...result });
}
