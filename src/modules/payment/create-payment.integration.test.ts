import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { MIDTRANS_SERVER_KEY: "integration-test-key" },
}));
vi.mock("@/modules/payment/provider", () => ({
  cancelQris: vi.fn().mockResolvedValue(undefined),
  createQris: vi.fn(),
  PaymentProviderError: class PaymentProviderError extends Error {},
}));

import { prisma } from "@/lib/prisma";
import { cancelMyBooking } from "@/modules/booking/cancel-booking";
import { createPaymentForCustomer } from "@/modules/payment/create-payment";
import {
  cancelQris,
  createQris,
  PaymentProviderError,
} from "@/modules/payment/provider";
import {
  addCalendarDays,
  getLocalDate,
  localDateTimeToUtc,
} from "@/modules/scheduling/time";

const token = randomUUID();
const now = new Date();
const date = addCalendarDays(getLocalDate(now, "Asia/Jakarta"), 35);
let userId = "";
let bookingId = "";
let packageId = "";

describe("create payment retries against PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        googleSub: `create-payment-${token}`,
        email: `create-payment-${token}@example.test`,
        name: "Create Payment Fixture",
      },
    });
    userId = user.id;
    const photoPackage = await prisma.package.create({
      data: {
        slug: `create-payment-${token}`,
        name: "Payment Retry Fixture",
        description: "Integration fixture",
        price: 75_000,
        durationMinutes: 60,
      },
    });
    packageId = photoPackage.id;
    const startAt = localDateTimeToUtc(`${date}T10:00`, "Asia/Jakarta");
    const holdExpiresAt = new Date(now.getTime() + 15 * 60_000);
    const booking = await prisma.booking.create({
      data: {
        code: `create-payment-${token}`,
        userId,
        packageId,
        packageNameSnapshot: photoPackage.name,
        priceSnapshot: photoPackage.price,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        status: "WAITING_PAYMENT",
        holdExpiresAt,
        payment: {
          create: {
            provider: "midtrans",
            providerOrderId: `create-payment-${token}`,
            amount: photoPackage.price,
            status: "UNPAID",
            expiresAt: holdExpiresAt,
          },
        },
      },
    });
    bookingId = booking.id;
  });

  afterAll(async () => {
    if (bookingId) await prisma.payment.deleteMany({ where: { bookingId } });
    if (bookingId)
      await prisma.booking.deleteMany({ where: { id: bookingId } });
    if (packageId)
      await prisma.package.deleteMany({ where: { id: packageId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("keeps the booking unpaid after provider failure and safely retries", async () => {
    vi.mocked(createQris).mockRejectedValueOnce(
      new PaymentProviderError("temporary provider failure"),
    );
    const failed = await createPaymentForCustomer(userId, bookingId);
    expect(failed).toEqual({ ok: false, code: "PROVIDER" });
    let payment = await prisma.payment.findUniqueOrThrow({
      where: { bookingId },
    });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(payment.status).toBe("UNPAID");
    expect(payment.qrImageUrl).toBeNull();
    expect(booking.status).toBe("WAITING_PAYMENT");

    vi.mocked(createQris).mockResolvedValueOnce({
      orderId: booking.code,
      transactionId: "retry-transaction",
      transactionStatus: "pending",
      grossAmount: "75000.00",
      qrImageUrl:
        "https://api.sandbox.midtrans.com/v4/qris/retry-transaction/qr-code",
    });
    const retried = await createPaymentForCustomer(userId, bookingId);
    expect(retried.ok).toBe(true);
    payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(payment.status).toBe("PENDING");
    expect(payment.providerOrderId).toBe(booking.code);
    expect(payment.providerTransactionId).toBe("retry-transaction");
    expect(payment.qrImageUrl).toContain("retry-transaction");
    expect(await prisma.payment.count({ where: { bookingId } })).toBe(1);
  });

  it("cancels a QR created while the booking is being cancelled", async () => {
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "WAITING_PAYMENT",
          holdExpiresAt: new Date(Date.now() + 15 * 60_000),
        },
      }),
      prisma.payment.update({
        where: { bookingId },
        data: {
          status: "UNPAID",
          qrImageUrl: null,
          providerTransactionId: null,
        },
      }),
    ]);
    let resolveCharge!: (value: Awaited<ReturnType<typeof createQris>>) => void;
    const charge = new Promise<Awaited<ReturnType<typeof createQris>>>(
      (resolve) => {
        resolveCharge = resolve;
      },
    );
    vi.mocked(createQris).mockReturnValueOnce(charge);

    const paymentRequest = createPaymentForCustomer(userId, bookingId);
    await vi.waitFor(() => expect(createQris).toHaveBeenCalled());
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { code: true },
    });
    const cancellation = await cancelMyBooking(userId, bookingId);
    expect(cancellation.ok).toBe(true);

    resolveCharge({
      orderId: booking.code,
      transactionId: "cancel-race-transaction",
      transactionStatus: "pending",
      grossAmount: "75000.00",
      qrImageUrl:
        "https://api.sandbox.midtrans.com/v4/qris/cancel-race-transaction/qr-code",
    });

    await expect(paymentRequest).resolves.toEqual({
      ok: false,
      code: "EXPIRED",
    });
    expect(cancelQris).toHaveBeenCalledWith(
      booking.code,
      "integration-test-key",
    );
    const persisted = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { status: true, payment: { select: { status: true } } },
    });
    expect(persisted).toEqual({
      status: "CANCELLED",
      payment: { status: "EXPIRED" },
    });
  });
});
