import "server-only";

import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { transitionBooking } from "@/modules/booking/state-machine";
import { calculateAvailability } from "@/modules/scheduling/availability";
import { PHOTO_SESSION_BUFFER_MINUTES } from "@/modules/scheduling/session-duration";
import {
  localDayBoundsUtc,
  getLocalDate,
  weekdayForLocalDate,
  localDateTimeToUtc,
} from "@/modules/scheduling/time";
import { cancelQris } from "@/modules/payment/provider";

export async function cancelBookingAsAdmin(
  bookingId: string,
  reason: string,
  now = new Date(),
) {
  const outcome = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE`;
      if (rows.length === 0)
        return { ok: false as const, code: "NOT_FOUND" as const };
      await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "payments" WHERE "bookingId" = ${bookingId} FOR UPDATE`;
      const current = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          status: true,
          payment: {
            select: { status: true, providerOrderId: true, qrImageUrl: true },
          },
        },
      });
      if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
      if (
        current.status !== "WAITING_PAYMENT" &&
        current.status !== "CONFIRMED"
      )
        return { ok: false as const, code: "INVALID_STATE" as const };
      const changed = await transitionBooking(
        tx,
        bookingId,
        current.status,
        "CANCELLED",
        { cancelledAt: now, cancelledBy: "ADMIN", cancelReason: reason },
      );
      if (!changed)
        return { ok: false as const, code: "INVALID_STATE" as const };
      const readySessions = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "photo_sessions"
        WHERE "bookingId" = ${bookingId} AND "status" = 'READY'
        FOR UPDATE
      `;
      for (const session of readySessions) {
        await tx.$executeRaw`
          UPDATE "photo_sessions"
          SET "status" = 'FAILED', "failedAt" = ${now}, "updatedAt" = ${now}
          WHERE "id" = ${session.id} AND "status" = 'READY'
        `;
        await tx.$executeRaw`
          UPDATE "booth_commands"
          SET "status" = 'FAILED', "failedAt" = ${now},
            "errorMessage" = 'Booking cancelled before session start'
          WHERE "photoSessionId" = ${session.id} AND "status" = 'PENDING'
        `;
      }
      const runningSessions = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "photo_sessions"
        WHERE "bookingId" = ${bookingId}
          AND "status" IN ('STARTING', 'ACTIVE', 'PROCESSING')
        LIMIT 1
      `;
      if (current.status === "WAITING_PAYMENT") {
        await tx.payment.updateMany({
          where: { bookingId, status: { in: ["UNPAID", "PENDING"] } },
          data: { status: "EXPIRED" },
        });
      }
      return {
        ok: true as const,
        needsRefund: current.payment?.status === "PAID",
        providerOrderId:
          current.status === "WAITING_PAYMENT" &&
          current.payment?.status === "PENDING" &&
          current.payment.qrImageUrl
            ? current.payment.providerOrderId
            : null,
        sessionStillActive: runningSessions.length > 0,
      };
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
  if (!outcome.ok) return outcome;
  let providerCancelFailed = false;
  if (outcome.providerOrderId) {
    if (!env.MIDTRANS_SERVER_KEY) providerCancelFailed = true;
    else {
      try {
        await cancelQris(outcome.providerOrderId, env.MIDTRANS_SERVER_KEY);
      } catch {
        providerCancelFailed = true;
      }
    }
  }
  return {
    ok: true as const,
    needsRefund: outcome.needsRefund,
    providerCancelFailed,
    sessionStillActive: outcome.sessionStillActive,
  };
}

function isBookingOverlapError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta ? JSON.stringify(error.meta) : "";
    if (
      (error.code === "P2010" && meta.includes("23P01")) ||
      (error.code === "P2004" && meta.includes("bookings_no_overlap"))
    )
      return true;
  }
  return (
    error instanceof Error &&
    (error.message.includes("bookings_no_overlap") ||
      error.message.includes("23P01"))
  );
}

export async function rescheduleBookingAsAdmin(
  input: {
    bookingId: string;
    newStartAt: string;
    expectedStartAt: Date;
  },
  now = new Date(),
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT "id" FROM "bookings" WHERE "id" = ${input.bookingId} FOR UPDATE`;
        if (locked.length === 0)
          return { ok: false as const, code: "NOT_FOUND" as const };
        const booking = await tx.booking.findUnique({
          where: { id: input.bookingId },
          select: { status: true, startAt: true, endAt: true },
        });
        if (!booking) return { ok: false as const, code: "NOT_FOUND" as const };
        if (booking.status !== "CONFIRMED")
          return { ok: false as const, code: "INVALID_STATE" as const };
        if (booking.startAt.getTime() !== input.expectedStartAt.getTime())
          return { ok: false as const, code: "STALE" as const };
        let newStartAt: Date;
        try {
          newStartAt = localDateTimeToUtc(
            input.newStartAt,
            env.STUDIO_TIMEZONE,
          );
        } catch {
          return { ok: false as const, code: "INVALID" as const };
        }
        if (newStartAt.getTime() === booking.startAt.getTime())
          return { ok: true as const };
        const slotDurationMinutes =
          (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000;
        const sessionDurationMinutes =
          slotDurationMinutes - PHOTO_SESSION_BUFFER_MINUTES;
        if (
          !Number.isInteger(sessionDurationMinutes) ||
          sessionDurationMinutes <= 0
        )
          return { ok: false as const, code: "INVALID" as const };
        const newEndAt = new Date(
          newStartAt.getTime() + slotDurationMinutes * 60_000,
        );
        const date = getLocalDate(newStartAt, env.STUDIO_TIMEZONE);
        const bounds = localDayBoundsUtc(date, env.STUDIO_TIMEZONE);
        const [hours, blocks, otherBookings] = await Promise.all([
          tx.operatingHour.findUnique({
            where: { weekday: weekdayForLocalDate(date) },
          }),
          tx.scheduleBlock.findMany({
            where: { startAt: { lt: newEndAt }, endAt: { gt: newStartAt } },
            select: { startAt: true, endAt: true },
          }),
          tx.booking.findMany({
            where: {
              id: { not: input.bookingId },
              startAt: { lt: bounds.end },
              endAt: { gt: bounds.start },
              OR: [
                { status: "CONFIRMED" },
                { status: "WAITING_PAYMENT", holdExpiresAt: { gt: now } },
              ],
            },
            select: {
              startAt: true,
              endAt: true,
              status: true,
              holdExpiresAt: true,
            },
          }),
        ]);
        const slots = calculateAvailability({
          date,
          timeZone: env.STUDIO_TIMEZONE,
          now,
          isOpen: hours?.isOpen ?? false,
          openTime: hours?.openTime ?? "00:00",
          closeTime: hours?.closeTime ?? "00:00",
          durationMinutes: sessionDurationMinutes,
          bufferMinutes: PHOTO_SESSION_BUFFER_MINUTES,
          slotIntervalMinutes: slotDurationMinutes,
          minLeadHours: env.MIN_LEAD_HOURS,
          maxAdvanceDays: env.MAX_ADVANCE_DAYS,
          bookings: otherBookings,
          blocks,
        });
        const valid = slots.some(
          (slot) =>
            slot.startAt.getTime() === newStartAt.getTime() &&
            slot.endAt.getTime() === newEndAt.getTime(),
        );
        if (!valid) return { ok: false as const, code: "CONFLICT" as const };
        const changed = await tx.booking.updateMany({
          where: {
            id: input.bookingId,
            status: "CONFIRMED",
            startAt: input.expectedStartAt,
          },
          data: { startAt: newStartAt, endAt: newEndAt },
        });
        if (changed.count !== 1)
          return { ok: false as const, code: "STALE" as const };
        return { ok: true as const };
      },
      { maxWait: 15_000, timeout: 15_000 },
    );
  } catch (error) {
    if (isBookingOverlapError(error))
      return { ok: false as const, code: "CONFLICT" as const };
    throw error;
  }
}

export async function markPaymentRefundedAsAdmin(input: {
  paymentId: string;
  adminId: string;
  reason: string;
  now?: Date;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1000)
    return { ok: false as const, code: "INVALID_INPUT" as const };

  const eligible = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, status: true, booking: { select: { status: true } } },
  });
  if (!eligible) return { ok: false as const, code: "NOT_FOUND" as const };
  if (eligible.status !== "PAID" || eligible.booking.status !== "CANCELLED")
    return { ok: false as const, code: "INVALID_STATE" as const };

  const changed = await prisma.payment.updateMany({
    where: {
      id: input.paymentId,
      status: "PAID",
      booking: { status: "CANCELLED" },
    },
    data: {
      status: "REFUNDED",
      refundedAt: input.now ?? new Date(),
      refundReason: reason,
      refundedByAdminId: input.adminId,
    },
  });
  return changed.count === 1
    ? { ok: true as const }
    : { ok: false as const, code: "INVALID_STATE" as const };
}
