import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { bookingIdSchema } from "@/modules/booking/schema";
import { expireStaleHolds } from "@/modules/booking/expiry";

export const dynamic = "force-dynamic";

type StatusRouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: StatusRouteProps) {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "CUSTOMER") {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const { id } = await params;
  const parsedId = bookingIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  }

  const booking = await prisma.$transaction(async (tx) => {
    const owned = await tx.booking.findFirst({
      where: { id: parsedId.data, userId: session.user.id },
      select: { id: true },
    });
    if (!owned) return null;
    await expireStaleHolds(tx, new Date(), { bookingId: parsedId.data });
    return tx.booking.findFirst({
      where: { id: parsedId.data, userId: session.user.id },
      select: {
        status: true,
        holdExpiresAt: true,
        payment: { select: { status: true } },
      },
    });
  });
  if (!booking) {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json(
    {
      ok: true,
      bookingStatus: booking.status,
      paymentStatus: booking.payment?.status ?? null,
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    },
    { headers: { "cache-control": "private, no-store, max-age=0" } },
  );
}
