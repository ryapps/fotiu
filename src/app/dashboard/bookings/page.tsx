import Link from "next/link";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/modules/auth/guards";
import { expireStaleHolds } from "@/modules/booking/expiry";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
} from "@/modules/booking/status-badges";
import { formatStudioDateTime } from "@/modules/scheduling/time";

type BookingListProps = {
  searchParams: Promise<{ tab?: string; cancelError?: string }>;
};

export default async function CustomerBookingsPage({
  searchParams,
}: BookingListProps) {
  const [{ userId }, query] = await Promise.all([
    requireCustomer(),
    searchParams,
  ]);
  const tab = query.tab === "history" ? "history" : "upcoming";
  const now = new Date();
  const bookings = await prisma.$transaction(async (tx) => {
    await expireStaleHolds(tx, now);
    return tx.booking.findMany({
      where: {
        userId,
        ...(tab === "upcoming"
          ? {
              status: { in: ["WAITING_PAYMENT", "CONFIRMED"] as const },
              startAt: { gte: now },
            }
          : {
              OR: [
                {
                  status: {
                    in: ["COMPLETED", "CANCELLED", "EXPIRED"] as const,
                  },
                },
                { startAt: { lt: now } },
              ],
            }),
      },
      select: {
        id: true,
        code: true,
        packageNameSnapshot: true,
        startAt: true,
        status: true,
        payment: { select: { status: true } },
      },
      orderBy: { startAt: tab === "upcoming" ? "asc" : "desc" },
    });
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-12">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Dashboard
      </Link>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Booking saya
          </h1>
          <p className="mt-2 text-muted-foreground">
            Jadwal mendatang dan riwayat booking Anda.
          </p>
        </div>
        <Button render={<Link href="/packages" />}>Buat booking baru</Button>
      </div>

      {query.cancelError === "invalid_input" && (
        <p
          className="mt-5 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          role="alert"
        >
          Permintaan pembatalan tidak valid. Buka detail booking dan coba lagi.
        </p>
      )}

      <nav className="mt-8 flex gap-2 border-b" aria-label="Filter booking">
        <Link
          href="/dashboard/bookings?tab=upcoming"
          aria-current={tab === "upcoming" ? "page" : undefined}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "upcoming" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Mendatang
        </Link>
        <Link
          href="/dashboard/bookings?tab=history"
          aria-current={tab === "history" ? "page" : undefined}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "history" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Riwayat
        </Link>
      </nav>

      {bookings.length ? (
        <ul className="mt-5 grid gap-3">
          {bookings.map((booking) => (
            <li
              key={booking.id}
              className="rounded-xl border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link
                    href={`/dashboard/bookings/${booking.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {booking.packageNameSnapshot}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {booking.code} ·{" "}
                    {formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <BookingStatusBadge status={booking.status} />
                  {booking.payment && (
                    <PaymentStatusBadge status={booking.payment.status} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            {tab === "upcoming"
              ? "Belum ada booking mendatang."
              : "Riwayat booking masih kosong."}
          </p>
          {tab === "upcoming" && (
            <Link
              href="/packages"
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
            >
              Lihat package
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
