import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { allowAgentRequest } from "@/modules/photobooth/agent-rate-limit";
import { parseAgentJson } from "@/modules/photobooth/agent-payload";
import { authenticateBoothDevice } from "@/modules/photobooth/device-auth";

export const dynamic = "force-dynamic";

const resultSchema = z
  .object({
    outcome: z.enum(["SUCCESS", "FAILED"]),
    providerSessionId: z.string().trim().min(1).max(255).nullable().optional(),
    errorCode: z
      .enum([
        "UNSUPPORTED_CAPABILITY",
        "PROVIDER_UNAVAILABLE",
        "PROVIDER_ERROR",
      ])
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.outcome === "FAILED" && !value.errorCode) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "Required for failed command.",
      });
    }
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const booth = await authenticateBoothDevice(request);
  if (!booth)
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401 },
    );
  if (!allowAgentRequest(`${booth.id}:command-result`, 120)) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  const { id } = await params;
  if (!id || id.length > 64)
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const parsed = await parseAgentJson(request, resultSchema);
  if (!parsed.ok)
    return NextResponse.json(
      { ok: false, code: parsed.code },
      { status: parsed.status },
    );

  const now = new Date();
  const result = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          photoSessionId: string;
          sessionStatus: string;
          bookingStatus: string;
          paymentStatus: string | null;
        }>
      >`
      SELECT command."id", command."status", command."photoSessionId", session."status" AS "sessionStatus",
        booking."status" AS "bookingStatus", payment."status" AS "paymentStatus"
      FROM "booth_commands" command
      JOIN "photo_sessions" session ON session."id" = command."photoSessionId" AND session."boothId" = command."boothId"
      JOIN "bookings" booking ON booking."id" = session."bookingId"
      LEFT JOIN "payments" payment ON payment."bookingId" = booking."id"
      WHERE command."id" = ${id} AND command."boothId" = ${booth.id}
      FOR UPDATE OF command
    `;
      const command = rows[0];
      if (!command) return { ok: false as const, code: "NOT_FOUND" as const };
      if (command.status === parsed.data.outcome)
        return { ok: true as const, duplicate: true };
      if (command.status !== "PROCESSING")
        return { ok: false as const, code: "INVALID_STATE" as const };

      if (parsed.data.outcome === "FAILED") {
        await tx.$executeRaw`UPDATE "booth_commands" SET "status" = 'FAILED', "failedAt" = ${now}, "errorMessage" = ${parsed.data.errorCode} WHERE "id" = ${id} AND "status" = 'PROCESSING'`;
        if (
          parsed.data.errorCode === "PROVIDER_UNAVAILABLE" ||
          parsed.data.errorCode === "UNSUPPORTED_CAPABILITY"
        ) {
          await tx.$executeRaw`UPDATE "photo_sessions" SET "status" = 'FAILED', "failedAt" = ${now}, "updatedAt" = ${now} WHERE "id" = ${command.photoSessionId} AND "status" = 'STARTING'`;
        } else {
          await tx.$executeRaw`UPDATE "booths" SET "isMaintenance" = true, "updatedAt" = ${now} WHERE "id" = ${booth.id}`;
        }
        return { ok: true as const, duplicate: false };
      }

      if (command.sessionStatus !== "STARTING")
        return { ok: false as const, code: "INVALID_STATE" as const };
      await tx.$executeRaw`UPDATE "booth_commands" SET "status" = 'SUCCESS', "executedAt" = ${now} WHERE "id" = ${id} AND "status" = 'PROCESSING'`;
      await tx.$executeRaw`UPDATE "photo_sessions" SET "providerSessionId" = ${parsed.data.providerSessionId ?? null}, "updatedAt" = ${now} WHERE "id" = ${command.photoSessionId} AND "status" = 'STARTING'`;
      if (
        command.bookingStatus !== "CONFIRMED" ||
        command.paymentStatus !== "PAID"
      ) {
        // The provider may already have started the physical session. Keep the
        // active-session reservation and require staff reconciliation.
        await tx.$executeRaw`UPDATE "booths" SET "isMaintenance" = true, "updatedAt" = ${now} WHERE "id" = ${booth.id}`;
      }
      return { ok: true as const, duplicate: false };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
  if (!result.ok)
    return NextResponse.json(result, {
      status: result.code === "NOT_FOUND" ? 404 : 409,
    });
  return NextResponse.json(result);
}
