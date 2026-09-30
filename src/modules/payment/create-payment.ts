import "server-only";

import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { expireStaleHolds } from "@/modules/booking/expiry";
import { createQris, PaymentProviderError } from "@/modules/payment/provider";

type PaymentResult = {
  id: string;
  status: string;
  qrImageUrl: string | null;
  expiresAt: Date | null;
};

type CreatePaymentOutcome =
  | { ok: true; payment: PaymentResult }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "INVALID_STATE"
        | "EXPIRED"
        | "NOT_CONFIGURED"
        | "PROVIDER";
    };

async function lockBookingThenPayment(
  tx: Prisma.TransactionClient,
  bookingId: string,
) {
  const bookingRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE
  `;
  if (bookingRows.length === 0) return false;
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "payments" WHERE "bookingId" = ${bookingId} FOR UPDATE
  `;
  return true;
}

export async function createPaymentForCustomer(
  userId: string,
  bookingId: string,
): Promise<CreatePaymentOutcome> {
  const initial = await prisma.$transaction(
    async (tx) => {
      const owned = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        select: { id: true },
      });
      if (!owned) return { ok: false as const, code: "NOT_FOUND" as const };
      await lockBookingThenPayment(tx, bookingId);
      await expireStaleHolds(tx, new Date(), { bookingId });
      const current = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        select: {
          id: true,
          code: true,
          status: true,
          holdExpiresAt: true,
          createdAt: true,
          priceSnapshot: true,
          payment: {
            select: {
              id: true,
              status: true,
              qrImageUrl: true,
              expiresAt: true,
            },
          },
        },
      });
      if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
      if (
        current.status === "EXPIRED" ||
        (current.holdExpiresAt && current.holdExpiresAt <= new Date())
      ) {
        return { ok: false as const, code: "EXPIRED" as const };
      }
      if (
        current.status !== "WAITING_PAYMENT" ||
        !current.holdExpiresAt ||
        !current.payment
      ) {
        return { ok: false as const, code: "INVALID_STATE" as const };
      }
      if (!["UNPAID", "PENDING"].includes(current.payment.status)) {
        return { ok: false as const, code: "INVALID_STATE" as const };
      }
      return {
        ok: true as const,
        booking: {
          ...current,
          amount: current.priceSnapshot,
          payment: current.payment,
        },
      };
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
  if (!initial.ok) return initial;
  const booking = initial.booking;

  const serverKey = env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return { ok: false, code: "NOT_CONFIGURED" };

  if (booking.payment?.status === "PENDING" && booking.payment.qrImageUrl) {
    return { ok: true, payment: booking.payment };
  }

  let qr;
  try {
    const holdExpiresAt = booking.holdExpiresAt;
    if (!holdExpiresAt) return { ok: false, code: "INVALID_STATE" };
    const durationMinutes = Math.max(
      1,
      Math.ceil(
        (holdExpiresAt.getTime() - booking.createdAt.getTime()) / 60_000,
      ),
    );
    qr = await createQris({
      orderId: booking.code,
      amount: booking.amount,
      expiresAt: holdExpiresAt,
      durationMinutes,
      serverKey,
    });
  } catch (error) {
    if (error instanceof PaymentProviderError)
      return { ok: false, code: "PROVIDER" };
    throw error;
  }

  return prisma.$transaction(
    async (tx) => {
      await lockBookingThenPayment(tx, bookingId);
      await expireStaleHolds(tx, new Date(), { bookingId });
      const current = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        select: {
          status: true,
          holdExpiresAt: true,
          payment: {
            select: {
              id: true,
              status: true,
              qrImageUrl: true,
              expiresAt: true,
            },
          },
        },
      });
      if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
      if (
        current.status !== "WAITING_PAYMENT" ||
        !current.holdExpiresAt ||
        current.holdExpiresAt <= new Date()
      ) {
        return { ok: false as const, code: "EXPIRED" as const };
      }
      if (!current.payment)
        return { ok: false as const, code: "INVALID_STATE" as const };
      if (current.payment.status === "PAID") {
        return { ok: true as const, payment: current.payment };
      }
      if (!["UNPAID", "PENDING"].includes(current.payment.status)) {
        return { ok: false as const, code: "INVALID_STATE" as const };
      }
      if (current.payment.qrImageUrl) {
        return { ok: true as const, payment: current.payment };
      }

      const updated = await tx.payment.update({
        where: { id: current.payment.id },
        data: {
          status: "PENDING",
          providerTransactionId: qr.transactionId,
          qrImageUrl: qr.qrImageUrl,
          expiresAt: current.holdExpiresAt,
        },
        select: { id: true, status: true, qrImageUrl: true, expiresAt: true },
      });
      return { ok: true as const, payment: updated };
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}
