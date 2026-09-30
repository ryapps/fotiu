import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/modules/booking/cron-auth";
import { expireStaleHolds } from "@/modules/booking/expiry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (
    !isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)
  ) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const expiredCount = await prisma.$transaction((tx) => expireStaleHolds(tx));
  return NextResponse.json({ ok: true, expiredCount });
}
