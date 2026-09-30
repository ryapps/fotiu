import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processMidtransNotification } from "@/modules/payment/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!env.MIDTRANS_SERVER_KEY) {
    return NextResponse.json(
      { ok: false, code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) {
    return NextResponse.json(
      { ok: false, code: "INVALID_NOTIFICATION" },
      { status: 401 },
    );
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 64_000) {
      return NextResponse.json(
        { ok: false, code: "INVALID_NOTIFICATION" },
        { status: 401 },
      );
    }
    const outcome = await processMidtransNotification(
      rawBody,
      env.MIDTRANS_SERVER_KEY,
    );
    if (outcome === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
