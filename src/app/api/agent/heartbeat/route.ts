import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { allowAgentRequest } from "@/modules/photobooth/agent-rate-limit";
import { authenticateBoothDevice } from "@/modules/photobooth/device-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const booth = await authenticateBoothDevice(request);
  if (!booth)
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401 },
    );
  if (!allowAgentRequest(`${booth.id}:heartbeat`, 30)) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${booth.id}`;
  return NextResponse.json({ ok: true });
}
