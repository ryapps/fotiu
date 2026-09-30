import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { processMidtransNotification } from "@/modules/payment/webhook";
import { createPaymentForCustomer } from "@/modules/payment/create-payment";
import { expireStaleHolds } from "@/modules/booking/expiry";
import {
  addCalendarDays,
  getLocalDate,
  localDateTimeToUtc,
} from "@/modules/scheduling/time";

const token = randomUUID();
const serverKey = `payment-test-${token}`;
const now = new Date();
const dates = [40, 41, 42].map((offset) =>
  addCalendarDays(getLocalDate(now, "Asia/Jakarta"), offset),
);
const userIds: string[] = [];
const bookingIds: string[] = [];
const eventKeys: string[] = [];
let packageId = "";
let ownerId = "";
let paidBookingId = "";
let lateBookingId = "";
let raceBookingId = "";
let paidOrderId = "";
let lateOrderId = "";
let raceOrderId = "";

const at = (index: number) =>
  localDateTimeToUtc(`${dates[index]}T10:00`, "Asia/Jakarta");

function makeNotification(input: {
  orderId: string;
  transactionId: string;
  transactionStatus: string;
  statusCode?: string;
  grossAmount?: string;
  fraudStatus?: string;
  validSignature?: boolean;
}) {
  const fields = {
    order_id: input.orderId,
    transaction_id: input.transactionId,
    transaction_status: input.transactionStatus,
    status_code:
      input.statusCode ??
      (input.transactionStatus === "settlement" ? "200" : "201"),
    gross_amount: input.grossAmount ?? "98000.00",
    payment_type: "qris",
    fraud_status: input.fraudStatus ?? "accept",
  };
  const signature = createHash("sha512")
    .update(
      `${fields.order_id}${fields.status_code}${fields.gross_amount}${serverKey}`,
    )
    .digest("hex");
  return JSON.stringify({
    ...fields,
    signature_key: input.validSignature === false ? "0".repeat(128) : signature,
  });
}

function trackEvent(key: string) {
  eventKeys.push(key);
}

async function createFixture(input: {
  suffix: string;
  dateIndex: number;
  bookingStatus: "WAITING_PAYMENT" | "EXPIRED";
  holdExpiresAt: Date;
  paymentStatus: "UNPAID" | "EXPIRED";
}) {
  const booking = await prisma.booking.create({
    data: {
      code: `payment-${token}-${input.suffix}`,
      userId: ownerId,
      packageId,
      packageNameSnapshot: "Payment Fixture",
      priceSnapshot: 98_000,
      startAt: at(input.dateIndex),
      endAt: new Date(at(input.dateIndex).getTime() + 60 * 60_000),
      status: input.bookingStatus,
      holdExpiresAt: input.holdExpiresAt,
      payment: {
        create: {
          provider: "midtrans",
          providerOrderId: `payment-${token}-${input.suffix}`,
          amount: 98_000,
          status: input.paymentStatus,
          expiresAt: input.holdExpiresAt,
        },
      },
    },
  });
  bookingIds.push(booking.id);
  return booking;
}

describe("Midtrans payment webhook against PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        googleSub: `payment-${token}`,
        email: `payment-${token}@example.test`,
        name: "Payment Fixture",
      },
    });
    ownerId = user.id;
    userIds.push(user.id);
    const photoPackage = await prisma.package.create({
      data: {
        slug: `payment-${token}`,
        name: "Payment Fixture",
        description: "Webhook integration fixture",
        price: 98_000,
        durationMinutes: 60,
      },
    });
    packageId = photoPackage.id;

    const holdExpiry = new Date(now.getTime() + 15 * 60_000);
    const paid = await createFixture({
      suffix: "paid",
      dateIndex: 0,
      bookingStatus: "WAITING_PAYMENT",
      holdExpiresAt: holdExpiry,
      paymentStatus: "UNPAID",
    });
    paidBookingId = paid.id;
    paidOrderId = paid.code;
    const late = await createFixture({
      suffix: "late",
      dateIndex: 1,
      bookingStatus: "EXPIRED",
      holdExpiresAt: new Date(now.getTime() - 60_000),
      paymentStatus: "EXPIRED",
    });
    lateBookingId = late.id;
    lateOrderId = late.code;
    const race = await createFixture({
      suffix: "race",
      dateIndex: 2,
      bookingStatus: "WAITING_PAYMENT",
      holdExpiresAt: new Date(now.getTime() - 1),
      paymentStatus: "UNPAID",
    });
    raceBookingId = race.id;
    raceOrderId = race.code;
  });

  afterAll(async () => {
    if (eventKeys.length)
      await prisma.paymentEvent.deleteMany({
        where: { eventKey: { in: eventKeys } },
      });
    if (bookingIds.length)
      await prisma.payment.deleteMany({
        where: { bookingId: { in: bookingIds } },
      });
    if (bookingIds.length)
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    if (packageId)
      await prisma.package.deleteMany({ where: { id: packageId } });
    if (userIds.length)
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("processes settlement once and ignores duplicate and out-of-order pending events", async () => {
    expect(
      await createPaymentForCustomer("not-the-owner", paidBookingId),
    ).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    const pendingRaw = makeNotification({
      orderId: paidOrderId,
      transactionId: "pending-1",
      transactionStatus: "pending",
    });
    const pendingKey = `${paidOrderId}:pending:pending-1`;
    trackEvent(pendingKey);
    expect(await processMidtransNotification(pendingRaw, serverKey)).toBe(
      "PROCESSED",
    );
    expect(await processMidtransNotification(pendingRaw, serverKey)).toBe(
      "DUPLICATE",
    );

    const settlementRaw = makeNotification({
      orderId: paidOrderId,
      transactionId: "settlement-1",
      transactionStatus: "settlement",
    });
    const settlementKey = `${paidOrderId}:settlement:settlement-1`;
    trackEvent(settlementKey);
    const results = await Promise.all([
      processMidtransNotification(settlementRaw, serverKey),
      processMidtransNotification(settlementRaw, serverKey),
    ]);
    expect(results.sort()).toEqual(["DUPLICATE", "PROCESSED"]);

    const oldPendingRaw = makeNotification({
      orderId: paidOrderId,
      transactionId: "pending-late",
      transactionStatus: "pending",
    });
    const oldPendingKey = `${paidOrderId}:pending:pending-late`;
    trackEvent(oldPendingKey);
    expect(await processMidtransNotification(oldPendingRaw, serverKey)).toBe(
      "IGNORED",
    );

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: paidBookingId },
    });
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { bookingId: paidBookingId },
    });
    expect(booking.status).toBe("CONFIRMED");
    expect(payment.status).toBe("PAID");
    expect(
      await prisma.paymentEvent.count({ where: { eventKey: settlementKey } }),
    ).toBe(1);
  });

  it("records invalid signatures and amount mismatches without confirming", async () => {
    const invalidRaw = makeNotification({
      orderId: paidOrderId,
      transactionId: "forged",
      transactionStatus: "settlement",
      validSignature: false,
    });
    const invalidKey = `invalid:${createHash("sha256").update(invalidRaw).digest("hex")}`;
    trackEvent(invalidKey);
    expect(await processMidtransNotification(invalidRaw, serverKey)).toBe(
      "UNAUTHORIZED",
    );

    const mismatchRaw = makeNotification({
      orderId: lateOrderId,
      transactionId: "wrong-amount",
      transactionStatus: "settlement",
      grossAmount: "1.00",
    });
    const mismatchKey = `${lateOrderId}:settlement:wrong-amount`;
    trackEvent(mismatchKey);
    expect(await processMidtransNotification(mismatchRaw, serverKey)).toBe(
      "REJECTED",
    );

    const invalidEvent = await prisma.paymentEvent.findUniqueOrThrow({
      where: { eventKey: invalidKey },
    });
    const mismatchEvent = await prisma.paymentEvent.findUniqueOrThrow({
      where: { eventKey: mismatchKey },
    });
    expect(invalidEvent.signatureValid).toBe(false);
    expect(invalidEvent.result).toBe("REJECTED");
    expect(mismatchEvent.signatureValid).toBe(true);
    expect(mismatchEvent.result).toBe("REJECTED");
    const late = await prisma.booking.findUniqueOrThrow({
      where: { id: lateBookingId },
      include: { payment: true },
    });
    expect(late.status).toBe("EXPIRED");
    expect(late.payment?.status).toBe("EXPIRED");
  });

  it("flags valid payment arriving after expiry for review without reopening the booking", async () => {
    const raw = makeNotification({
      orderId: lateOrderId,
      transactionId: "late-settlement",
      transactionStatus: "settlement",
    });
    const key = `${lateOrderId}:settlement:late-settlement`;
    trackEvent(key);
    expect(await processMidtransNotification(raw, serverKey)).toBe("PROCESSED");
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: lateBookingId },
    });
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { bookingId: lateBookingId },
    });
    expect(booking.status).toBe("EXPIRED");
    expect(payment.status).toBe("PAID");
    expect(payment.needsReview).toBe(true);
  });

  it("keeps expiry and settlement race in a consistent terminal state", async () => {
    const raw = makeNotification({
      orderId: raceOrderId,
      transactionId: "race-settlement",
      transactionStatus: "settlement",
    });
    const key = `${raceOrderId}:settlement:race-settlement`;
    trackEvent(key);
    const results = await Promise.all([
      prisma.$transaction((tx) =>
        expireStaleHolds(tx, now, { bookingId: raceBookingId }),
      ),
      processMidtransNotification(raw, serverKey),
    ]);
    expect(results[1]).toBe("PROCESSED");
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: raceBookingId },
    });
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { bookingId: raceBookingId },
    });
    expect(["CONFIRMED", "EXPIRED"]).toContain(booking.status);
    expect(payment.status).toBe("PAID");
    expect(payment.needsReview).toBe(booking.status === "EXPIRED");
  });
});
