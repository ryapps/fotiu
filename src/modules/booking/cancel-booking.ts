import "server-only";

import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { expireStaleHolds } from "@/modules/booking/expiry";
import { transitionBooking } from "@/modules/booking/state-machine";
import { cancelQris } from "@/modules/payment/provider";

type CancelBookingOutcome =
  | {
      ok: true;
      requiresManualRefund: boolean;
      providerCancelFailed: boolean;
    }
  | { ok: false; code: "NOT_FOUND" | "INVALID_STATE" | "TOO_LATE" };

async function lockBookingThenPayment(
  tx: Prisma.TransactionClient,
  bookingId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE
  `;
  if (rows.length === 0) return false;
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "payments" WHERE "bookingId" = ${bookingId} FOR UPDATE
  `;
  return true;
}

export async function cancelMyBooking(
  userId: string,
  bookingId: string,
  reason?: string,
  now = new Date(),
): Promise<CancelBookingOutcome> {
  const outcome = await prisma.$transaction(
    async (tx) => {
      const owned = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        select: { id: true },
      });
      if (!owned) return { ok: false as const, code: "NOT_FOUND" as const };

      await lockBookingThenPayment(tx, bookingId);
      await expireStaleHolds(tx, now, { bookingId });
      const current = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        select: {
          status: true,
          startAt: true,
          holdExpiresAt: true,
          payment: {
            select: {
              providerOrderId: true,
              status: true,
              qrImageUrl: true,
            },
          },
        },
      });
      if (!current) return { ok: false as const, code: "NOT_FOUND" as const };

      const isWaitingPayment = current.status === "WAITING_PAYMENT";
      if (isWaitingPayment) {
        if (
          !current.holdExpiresAt ||
          current.holdExpiresAt <= now ||
          !current.payment ||
          !["UNPAID", "PENDING"].includes(current.payment.status)
        ) {
          return { ok: false as const, code: "INVALID_STATE" as const };
        }
      } else if (current.status === "CONFIRMED") {
        const cancellationWindowMs =
          env.CUSTOMER_CANCEL_DEADLINE_HOURS * 60 * 60 * 1000;
        if (current.startAt.getTime() - now.getTime() < cancellationWindowMs) {
          return { ok: false as const, code: "TOO_LATE" as const };
        }
        if (current.payment?.status !== "PAID") {
          return { ok: false as const, code: "INVALID_STATE" as const };
        }
      } else {
        return { ok: false as const, code: "INVALID_STATE" as const };
      }

      const previousStatus = current.status;
      const transitioned = await transitionBooking(
        tx,
        bookingId,
        previousStatus,
        "CANCELLED",
        {
          cancelledAt: now,
          cancelledBy: "CUSTOMER",
          cancelReason: reason?.trim() || null,
        },
      );
      if (!transitioned)
        return { ok: false as const, code: "INVALID_STATE" as const };

      if (isWaitingPayment) {
        await tx.payment.updateMany({
          where: {
            bookingId,
            status: { in: ["UNPAID", "PENDING"] },
          },
          data: { status: "EXPIRED" },
        });
      }

      return {
        ok: true as const,
        requiresManualRefund: current.payment?.status === "PAID",
        providerOrderId:
          isWaitingPayment &&
          current.payment?.status === "PENDING" &&
          current.payment.qrImageUrl
            ? current.payment.providerOrderId
            : null,
      };
    },
    { maxWait: 15_000, timeout: 15_000 },
  );

  if (!outcome.ok) return outcome;

  let providerCancelFailed = false;
  if (outcome.providerOrderId) {
    if (!env.MIDTRANS_SERVER_KEY) {
      providerCancelFailed = true;
    } else {
      try {
        await cancelQris(outcome.providerOrderId, env.MIDTRANS_SERVER_KEY);
      } catch {
        providerCancelFailed = true;
      }
    }
  }

  return {
    ok: true,
    requiresManualRefund: outcome.requiresManualRefund,
    providerCancelFailed,
  };
}
