import "server-only";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { transitionBooking } from "@/modules/booking/state-machine";
import { cancelQris } from "@/modules/payment/provider";

export async function cancelBookingAsAdmin(bookingId: string, reason: string, now = new Date()) {
  const outcome = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE`;
    if (rows.length === 0) return { ok: false as const, code: "NOT_FOUND" as const };
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "payments" WHERE "bookingId" = ${bookingId} FOR UPDATE`;
    const current = await tx.booking.findUnique({ where: { id: bookingId }, select: { status: true, payment: { select: { status: true, providerOrderId: true, qrImageUrl: true } } } });
    if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
    if (current.status !== "WAITING_PAYMENT" && current.status !== "CONFIRMED") return { ok: false as const, code: "INVALID_STATE" as const };
    const changed = await transitionBooking(tx, bookingId, current.status, "CANCELLED", { cancelledAt: now, cancelledBy: "ADMIN", cancelReason: reason });
    if (!changed) return { ok: false as const, code: "INVALID_STATE" as const };
    if (current.status === "WAITING_PAYMENT") {
      await tx.payment.updateMany({ where: { bookingId, status: { in: ["UNPAID", "PENDING"] } }, data: { status: "EXPIRED" } });
    }
    return { ok: true as const, needsRefund: current.payment?.status === "PAID", providerOrderId: current.status === "WAITING_PAYMENT" && current.payment?.status === "PENDING" && current.payment.qrImageUrl ? current.payment.providerOrderId : null };
  }, { maxWait: 15_000, timeout: 15_000 });
  if (!outcome.ok) return outcome;
  let providerCancelFailed = false;
  if (outcome.providerOrderId) {
    if (!env.MIDTRANS_SERVER_KEY) providerCancelFailed = true;
    else {
      try { await cancelQris(outcome.providerOrderId, env.MIDTRANS_SERVER_KEY); }
      catch { providerCancelFailed = true; }
    }
  }
  return { ok: true as const, needsRefund: outcome.needsRefund, providerCancelFailed };
}
