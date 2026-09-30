import { createHash, randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: { ...actual.env, MIDTRANS_SERVER_KEY: "cancel-test-server-key" },
  };
});
vi.mock("@/modules/payment/provider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/payment/provider")>();
  return { ...actual, cancelQris: vi.fn().mockResolvedValue(undefined) };
});

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { cancelMyBooking } from "@/modules/booking/cancel-booking";
import { processMidtransNotification } from "@/modules/payment/webhook";
import { cancelQris } from "@/modules/payment/provider";

const token = randomUUID();
const now = new Date();
const bookingIds: string[] = [];
const userIds: string[] = [];
const packageIds: string[] = [];
let ownerId = "";
let otherUserId = "";
let packageId = "";

async function createBookingFixture(input: {
  status: "WAITING_PAYMENT" | "CONFIRMED" | "COMPLETED";
  paymentStatus: "UNPAID" | "PENDING" | "PAID";
  startAt: Date;
}) {
  const code = `FT-CANCEL-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const booking = await prisma.booking.create({
    data: {
      code,
      userId: ownerId,
      packageId,
      packageNameSnapshot: "Cancellation fixture",
      priceSnapshot: 123_000,
      startAt: input.startAt,
      endAt: new Date(input.startAt.getTime() + 60 * 60_000),
      status: input.status,
      holdExpiresAt:
        input.status === "WAITING_PAYMENT"
          ? new Date(now.getTime() + 15 * 60_000)
          : null,
      payment: {
        create: {
          provider: "midtrans",
          providerOrderId: code,
          amount: 123_000,
          status: input.paymentStatus,
          qrImageUrl:
            input.paymentStatus === "PENDING"
              ? "https://api.sandbox.midtrans.com/v4/qris/test/qr-code"
              : null,
          expiresAt:
            input.status === "WAITING_PAYMENT"
              ? new Date(now.getTime() + 15 * 60_000)
              : null,
        },
      },
    },
    select: { id: true, code: true },
  });
  bookingIds.push(booking.id);
  return booking;
}

describe("customer booking cancellation against PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const users = await Promise.all(
      ["owner", "other"].map((label) =>
        prisma.user.create({
          data: {
            googleSub: `cancel-${token}-${label}`,
            email: `cancel-${token}-${label}@example.test`,
            name: label,
          },
          select: { id: true },
        }),
      ),
    );
    ownerId = users[0].id;
    otherUserId = users[1].id;
    userIds.push(ownerId, otherUserId);
    const photoPackage = await prisma.package.create({
      data: {
        slug: `cancel-${token}`,
        name: "Cancellation fixture",
        description: "Integration fixture",
        price: 123_000,
        durationMinutes: 60,
      },
      select: { id: true },
    });
    packageId = photoPackage.id;
    packageIds.push(packageId);
  });

  beforeEach(() => vi.mocked(cancelQris).mockClear());

  afterAll(async () => {
    if (bookingIds.length) {
      const payments = await prisma.payment.findMany({
        where: { bookingId: { in: bookingIds } },
        select: { id: true },
      });
      await prisma.paymentEvent.deleteMany({
        where: { paymentId: { in: payments.map(({ id }) => id) } },
      });
      await prisma.payment.deleteMany({
        where: { bookingId: { in: bookingIds } },
      });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (packageIds.length)
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
    if (userIds.length)
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("cancels a payment hold and best-effort cancels its pending QRIS", async () => {
    const booking = await createBookingFixture({
      status: "WAITING_PAYMENT",
      paymentStatus: "PENDING",
      startAt: new Date(now.getTime() + 3 * 24 * 60 * 60_000),
    });

    const result = await cancelMyBooking(
      ownerId,
      booking.id,
      "Berhalangan",
      now,
    );

    expect(result).toEqual({
      ok: true,
      requiresManualRefund: false,
      providerCancelFailed: false,
    });
    expect(cancelQris).toHaveBeenCalledWith(
      booking.code,
      env.MIDTRANS_SERVER_KEY,
    );
    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: {
        status: true,
        cancelledBy: true,
        cancelReason: true,
        cancelledAt: true,
        payment: { select: { status: true } },
      },
    });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.cancelledBy).toBe("CUSTOMER");
    expect(updated.cancelReason).toBe("Berhalangan");
    expect(updated.cancelledAt).toEqual(now);
    expect(updated.payment?.status).toBe("EXPIRED");

    const repeated = await cancelMyBooking(ownerId, booking.id, undefined, now);
    expect(repeated).toEqual({ ok: false, code: "INVALID_STATE" });
    expect(cancelQris).toHaveBeenCalledTimes(1);
  });

  it("keeps the booking cancelled when Midtrans cancellation is unavailable", async () => {
    vi.mocked(cancelQris).mockRejectedValueOnce(new Error("provider offline"));
    const booking = await createBookingFixture({
      status: "WAITING_PAYMENT",
      paymentStatus: "PENDING",
      startAt: new Date(now.getTime() + 4 * 24 * 60 * 60_000),
    });

    const result = await cancelMyBooking(ownerId, booking.id, undefined, now);

    expect(result).toEqual({
      ok: true,
      requiresManualRefund: false,
      providerCancelFailed: true,
    });
    await expect(
      prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true, payment: { select: { status: true } } },
      }),
    ).resolves.toEqual({ status: "CANCELLED", payment: { status: "EXPIRED" } });
  });

  it("allows cancellation exactly at the confirmed-booking deadline and keeps PAID for manual refund", async () => {
    const startAt = new Date(
      now.getTime() + env.CUSTOMER_CANCEL_DEADLINE_HOURS * 60 * 60_000,
    );
    const booking = await createBookingFixture({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      startAt,
    });

    const result = await cancelMyBooking(ownerId, booking.id, undefined, now);

    expect(result).toEqual({
      ok: true,
      requiresManualRefund: true,
      providerCancelFailed: false,
    });
    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true, payment: { select: { status: true } } },
    });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.payment?.status).toBe("PAID");
  });

  it("rejects a confirmed cancellation one millisecond inside the deadline", async () => {
    const startAt = new Date(
      now.getTime() + env.CUSTOMER_CANCEL_DEADLINE_HOURS * 60 * 60_000 - 1,
    );
    const booking = await createBookingFixture({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      startAt,
    });

    const result = await cancelMyBooking(ownerId, booking.id, undefined, now);

    expect(result).toEqual({ ok: false, code: "TOO_LATE" });
    await expect(
      prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "CONFIRMED" });
  });

  it("returns not found to a different customer", async () => {
    const booking = await createBookingFixture({
      status: "WAITING_PAYMENT",
      paymentStatus: "UNPAID",
      startAt: new Date(now.getTime() + 5 * 24 * 60 * 60_000),
    });

    const result = await cancelMyBooking(
      otherUserId,
      booking.id,
      undefined,
      now,
    );

    expect(result).toEqual({ ok: false, code: "NOT_FOUND" });
    await expect(
      prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "WAITING_PAYMENT" });
  });

  it("rejects cancellation after a booking is completed", async () => {
    const booking = await createBookingFixture({
      status: "COMPLETED",
      paymentStatus: "PAID",
      startAt: new Date(now.getTime() - 24 * 60 * 60_000),
    });

    const result = await cancelMyBooking(ownerId, booking.id, undefined, now);

    expect(result).toEqual({ ok: false, code: "INVALID_STATE" });
    await expect(
      prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "COMPLETED" });
  });

  it("serializes cancellation with a valid settlement webhook", async () => {
    const booking = await createBookingFixture({
      status: "WAITING_PAYMENT",
      paymentStatus: "PENDING",
      startAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
    });
    const serverKey = env.MIDTRANS_SERVER_KEY ?? "test-server-key";
    const fields = {
      order_id: booking.code,
      status_code: "200",
      gross_amount: "123000.00",
      transaction_id: `txn-${token}`,
      transaction_status: "settlement",
      payment_type: "qris",
      fraud_status: "accept",
    };
    const payload = JSON.stringify({
      ...fields,
      signature_key: createHash("sha512")
        .update(
          `${fields.order_id}${fields.status_code}${fields.gross_amount}${serverKey}`,
        )
        .digest("hex"),
    });

    await Promise.all([
      cancelMyBooking(ownerId, booking.id, undefined, now),
      processMidtransNotification(payload, serverKey),
    ]);

    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: {
        status: true,
        payment: { select: { status: true } },
      },
    });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.payment?.status).toBe("PAID");
  });
});
