import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/modules/auth/guards";
import { expireStaleHolds } from "@/modules/booking/expiry";
import { formatStudioDateTime } from "@/modules/scheduling/time";

type BookingDetailProps = { params: Promise<{ id: string }> };

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function BookingDetailPage({
  params,
}: BookingDetailProps) {
  const [{ id }, { userId }] = await Promise.all([params, requireCustomer()]);
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
        payment: { select: { status: true } },
      },
    });
  });
  if (!booking) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
      <Link
        className="text-sm font-medium text-primary hover:underline"
        href="/dashboard"
      >
        ← Dashboard
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Booking {booking.code}</h1>
      <p className="mt-2 text-muted-foreground">
        Status: {booking.status.replaceAll("_", " ")}
      </p>
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
              {booking.payment?.status ?? "Belum dibuat"}
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
          <p className="mt-6 rounded-md bg-secondary/60 p-3 text-sm">
            Pembayaran QRIS akan tersedia pada tahap berikutnya. Slot tetap
            ditahan sampai batas waktu di atas.
          </p>
        )}
      </section>
    </main>
  );
}
