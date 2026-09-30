import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/modules/auth/guards";
import { CancelBookingButton } from "@/modules/booking/cancel-booking-button";
import { expireStaleHolds } from "@/modules/booking/expiry";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
} from "@/modules/booking/status-badges";
import { formatStudioDateTime } from "@/modules/scheduling/time";
import { createPaymentAction } from "@/modules/payment/actions";
import { PaymentStatusPoller } from "@/modules/payment/payment-status-poller";

type BookingDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    paymentError?: string;
    cancelled?: string;
    providerCancel?: string;
    cancelError?: string;
  }>;
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function canCancelConfirmed(startAt: Date, deadlineHours: number) {
  return startAt.getTime() - Date.now() >= deadlineHours * 60 * 60 * 1000;
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: BookingDetailProps) {
  const [{ id }, query, { userId }] = await Promise.all([
    params,
    searchParams,
    requireCustomer(),
  ]);
  const booking = await prisma.$transaction(async (tx) => {
    const owned = await tx.booking.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) return null;
    await expireStaleHolds(tx, new Date(), { bookingId: id });
    return tx.booking.findFirst({
      where: { id, userId },
      select: {
        id: true,
        code: true,
        packageNameSnapshot: true,
        priceSnapshot: true,
        startAt: true,
        endAt: true,
        status: true,
        holdExpiresAt: true,
        payment: { select: { status: true, qrImageUrl: true } },
      },
    });
  });
  if (!booking) notFound();

  const canCancel =
    booking.status === "WAITING_PAYMENT" ||
    (booking.status === "CONFIRMED" &&
      canCancelConfirmed(booking.startAt, env.CUSTOMER_CANCEL_DEADLINE_HOURS));
  const cancelErrorMessage =
    query.cancelError === "too_late"
      ? `Booking hanya dapat dibatalkan paling lambat ${env.CUSTOMER_CANCEL_DEADLINE_HOURS} jam sebelum sesi.`
      : query.cancelError === "invalid_state"
        ? "Booking ini sudah tidak dapat dibatalkan. Muat ulang halaman untuk melihat status terbaru."
        : query.cancelError === "not_found"
          ? "Booking tidak ditemukan."
          : query.cancelError
            ? "Permintaan pembatalan gagal. Coba lagi."
            : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="text-sm font-medium text-primary hover:underline"
          href="/dashboard"
        >
          ← Dashboard
        </Link>
        <Link
          className="text-sm font-medium text-primary hover:underline"
          href="/dashboard/bookings"
        >
          Semua booking
        </Link>
      </div>
      <h1 className="mt-6 text-3xl font-semibold">Booking {booking.code}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <BookingStatusBadge status={booking.status} />
        {booking.payment && (
          <PaymentStatusBadge status={booking.payment.status} />
        )}
      </div>
      {booking.status === "CONFIRMED" && booking.payment?.status === "PAID" && (
        <div
          className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          <p className="font-semibold">Pembayaran berhasil!</p>
          <p className="mt-1 text-sm">
            Booking Anda sudah dikonfirmasi. Sampai jumpa di studio.
          </p>
        </div>
      )}
      {query.paymentError && (
        <p
          className="mt-5 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          role="alert"
        >
          {query.paymentError === "not_configured"
            ? "Midtrans belum dikonfigurasi. Atur MIDTRANS_SERVER_KEY di environment server."
            : query.paymentError === "expired"
              ? "Waktu pembayaran sudah habis. Booking telah dilepas."
              : query.paymentError === "not_found"
                ? "Booking tidak ditemukan."
                : "QRIS belum berhasil dibuat. Coba lagi selama waktu booking masih tersedia."}
        </p>
      )}
      {query.cancelled === "1" && booking.status === "CANCELLED" && (
        <div
          className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          <p className="font-semibold">Booking berhasil dibatalkan.</p>
          {booking.payment?.status === "PAID" ? (
            <p className="mt-1 text-sm">
              Pembayaran perlu ditindaklanjuti studio untuk refund manual.
            </p>
          ) : query.providerCancel === "failed" ? (
            <p className="mt-1 text-sm">
              QRIS mungkin masih aktif di Midtrans. Jangan lanjut membayar dan
              hubungi studio jika status pembayaran berubah.
            </p>
          ) : null}
        </div>
      )}
      {cancelErrorMessage && (
        <p
          className="mt-5 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          role="alert"
        >
          {cancelErrorMessage}
        </p>
      )}
      <section className="mt-6 rounded-xl border bg-card p-5 sm:p-7">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Package</dt>
            <dd className="mt-1 font-medium">{booking.packageNameSnapshot}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Harga</dt>
            <dd className="mt-1 font-medium">
              {formatRupiah(booking.priceSnapshot)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Mulai</dt>
            <dd className="mt-1 font-medium">
              {formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Selesai</dt>
            <dd className="mt-1 font-medium">
              {formatStudioDateTime(booking.endAt, env.STUDIO_TIMEZONE)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Pembayaran</dt>
            <dd className="mt-1 font-medium">
              {booking.payment ? (
                <PaymentStatusBadge status={booking.payment.status} />
              ) : (
                "Belum dibuat"
              )}
            </dd>
          </div>
          {booking.status === "WAITING_PAYMENT" && booking.holdExpiresAt && (
            <div>
              <dt className="text-sm text-muted-foreground">Batas hold</dt>
              <dd className="mt-1 font-medium">
                {formatStudioDateTime(
                  booking.holdExpiresAt,
                  env.STUDIO_TIMEZONE,
                )}
              </dd>
            </div>
          )}
        </dl>
        {booking.status === "WAITING_PAYMENT" && (
          <>
            <PaymentStatusPoller
              bookingId={booking.id}
              bookingStatus={booking.status}
              paymentStatus={booking.payment?.status ?? null}
              holdExpiresAt={booking.holdExpiresAt?.toISOString() ?? null}
            />
            {booking.payment?.qrImageUrl ? (
              <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border p-5">
                <Image
                  src={booking.payment.qrImageUrl}
                  alt="QRIS untuk pembayaran booking"
                  width={280}
                  height={280}
                  unoptimized
                  className="h-64 w-64 object-contain"
                />
                <p className="text-center text-sm text-muted-foreground">
                  Scan QRIS sebelum waktu pembayaran habis.
                </p>
              </div>
            ) : booking.payment?.status === "UNPAID" ||
              booking.payment?.status === "PENDING" ? (
              <form action={createPaymentAction} className="mt-6">
                <input type="hidden" name="bookingId" value={booking.id} />
                <button
                  type="submit"
                  className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground"
                >
                  {booking.payment.status === "PENDING"
                    ? "Pulihkan QRIS"
                    : "Buat QRIS"}
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-md bg-secondary/60 p-3 text-sm">
                Status pembayaran: {booking.payment?.status ?? "belum tersedia"}
                .
              </p>
            )}
          </>
        )}
        {canCancel && (
          <div className="mt-6 border-t pt-5">
            <p className="mb-3 text-sm text-muted-foreground">
              {booking.status === "CONFIRMED"
                ? `Pembatalan tersedia sampai ${env.CUSTOMER_CANCEL_DEADLINE_HOURS} jam sebelum sesi. Refund pembayaran diproses manual oleh studio.`
                : "Membatalkan booking akan melepas slot dan menonaktifkan QRIS yang tersedia."}
            </p>
            <CancelBookingButton bookingId={booking.id} />
          </div>
        )}
      </section>
    </main>
  );
}
