import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transitionBooking } from "@/modules/booking/state-machine";
import {
  isGrossAmountEqual,
  mapStatus,
  verifyWebhookSignature,
} from "@/modules/payment/provider";
import { z } from "zod";

const scalar = z.union([z.string(), z.number()]).transform(String);
const notificationSchema = z
  .object({
    order_id: z.string().min(1).max(255),
    status_code: scalar,
    gross_amount: scalar,
    signature_key: z.string(),
    transaction_id: z.string().min(1).max(255),
    transaction_status: z.string().min(1).max(64),
    payment_type: z.string().optional(),
    fraud_status: z.string().optional(),
    transaction_time: z.string().optional(),
  })
  .passthrough();

export type WebhookOutcome =
  "UNAUTHORIZED" | "PROCESSED" | "DUPLICATE" | "IGNORED" | "REJECTED";

function eventKeyFor(event: z.infer<typeof notificationSchema>) {
  return `${event.order_id}:${event.transaction_status}:${event.transaction_id}`;
}

function invalidEventKey(rawBody: string) {
  return `invalid:${createHash("sha256").update(rawBody).digest("hex")}`;
}

async function recordInvalidEvent(
  rawBody: string,
  payload: Prisma.InputJsonValue,
) {
  await prisma.paymentEvent.createMany({
    data: [
      {
        provider: "midtrans",
        eventKey: invalidEventKey(rawBody),
        rawPayload: payload,
        signatureValid: false,
        result: "REJECTED",
      },
    ],
    skipDuplicates: true,
  });
}

export async function processMidtransNotification(
  rawBody: string,
  serverKey: string,
): Promise<WebhookOutcome> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await recordInvalidEvent(rawBody, { rawBody: rawBody.slice(0, 16_000) });
    return "UNAUTHORIZED";
  }

  const parsed = notificationSchema.safeParse(payload);
  if (!parsed.success) {
    await recordInvalidEvent(rawBody, {
      payload: payload as Prisma.InputJsonValue,
    });
    return "UNAUTHORIZED";
  }
  const event = parsed.data;
  const signatureValid = verifyWebhookSignature({
    orderId: event.order_id,
    statusCode: event.status_code,
    grossAmount: event.gross_amount,
    signatureKey: event.signature_key,
    serverKey,
  });
  if (!signatureValid) {
    await recordInvalidEvent(rawBody, {
      payload: payload as Prisma.InputJsonValue,
    });
    return "UNAUTHORIZED";
  }

  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: event.order_id },
    select: { id: true, bookingId: true },
  });
  if (!payment) {
    await prisma.paymentEvent.createMany({
      data: [
        {
          provider: "midtrans",
          eventKey: eventKeyFor(event),
          rawPayload: payload as Prisma.InputJsonValue,
          signatureValid: true,
          result: "IGNORED",
        },
      ],
      skipDuplicates: true,
    });
    return "IGNORED";
  }

  return prisma.$transaction(
    async (tx) => {
      // Match expiry.ts lock order: booking first, then payment. Both paths make
      // their terminal state transition conditional on WAITING_PAYMENT.
      await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "bookings" WHERE "id" = ${payment.bookingId} FOR UPDATE
    `;
      await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "payments" WHERE "id" = ${payment.id} FOR UPDATE
    `;
      const current = await tx.payment.findUnique({
        where: { id: payment.id },
        select: {
          id: true,
          bookingId: true,
          amount: true,
          status: true,
          booking: { select: { status: true, holdExpiresAt: true } },
        },
      });
      if (!current) return "IGNORED";

      const inserted = await tx.paymentEvent.createMany({
        data: [
          {
            paymentId: current.id,
            provider: "midtrans",
            eventKey: eventKeyFor(event),
            rawPayload: payload as Prisma.InputJsonValue,
            signatureValid: true,
            result: "IGNORED",
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return "DUPLICATE";

      if (!isGrossAmountEqual(event.gross_amount, current.amount)) {
        await tx.paymentEvent.update({
          where: { eventKey: eventKeyFor(event) },
          data: { result: "REJECTED" },
        });
        return "REJECTED";
      }

      const target = mapStatus(event.transaction_status);
      if (
        target === "PAID" &&
        (event.payment_type?.toLowerCase() !== "qris" ||
          event.status_code !== "200" ||
          (event.fraud_status && event.fraud_status.toLowerCase() !== "accept"))
      ) {
        await tx.paymentEvent.update({
          where: { eventKey: eventKeyFor(event) },
          data: { result: "REJECTED" },
        });
        return "REJECTED";
      }

      const now = new Date();
      let paymentStatus: PaymentStatus | null = null;
      let needsReview = false;
      let paidAt: Date | undefined;
      let result: "PROCESSED" | "IGNORED" = "IGNORED";

      if (
        target === "PAID" &&
        current.status !== "PAID" &&
        current.status !== "REFUNDED"
      ) {
        if (current.booking.status === "WAITING_PAYMENT") {
          const transitioned = await transitionBooking(
            tx,
            current.bookingId,
            "WAITING_PAYMENT",
            "CONFIRMED",
          );
          if (transitioned) {
            paymentStatus = "PAID";
            paidAt = now;
            result = "PROCESSED";
          }
        } else if (["EXPIRED", "CANCELLED"].includes(current.booking.status)) {
          paymentStatus = "PAID";
          paidAt = now;
          needsReview = true;
          result = "PROCESSED";
        } else if (
          ["CONFIRMED", "COMPLETED"].includes(current.booking.status)
        ) {
          paymentStatus = "PAID";
          paidAt = now;
          result = "PROCESSED";
        }
      } else if (target === "PENDING" && current.status === "UNPAID") {
        paymentStatus = "PENDING";
        result = "PROCESSED";
      } else if (
        (target === "EXPIRED" || target === "FAILED") &&
        (current.status === "UNPAID" || current.status === "PENDING")
      ) {
        paymentStatus = target;
        result = "PROCESSED";
        if (
          target === "EXPIRED" &&
          current.booking.status === "WAITING_PAYMENT" &&
          current.booking.holdExpiresAt &&
          current.booking.holdExpiresAt <= now
        ) {
          await transitionBooking(
            tx,
            current.bookingId,
            "WAITING_PAYMENT",
            "EXPIRED",
          );
        }
      }

      if (paymentStatus) {
        await tx.payment.update({
          where: { id: current.id },
          data: {
            status: paymentStatus,
            providerTransactionId: event.transaction_id,
            ...(paidAt ? { paidAt } : {}),
            ...(paymentStatus === "PAID" ? { needsReview } : {}),
          },
        });
      }
      await tx.paymentEvent.update({
        where: { eventKey: eventKeyFor(event) },
        data: { result },
      });
      return result;
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}
