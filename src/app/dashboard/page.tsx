import Link from "next/link";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { signOutCustomer } from "@/modules/auth/actions";
import { requireCustomer } from "@/modules/auth/guards";
import { expireStaleHolds } from "@/modules/booking/expiry";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
} from "@/modules/booking/status-badges";
import { formatStudioDateTime } from "@/modules/scheduling/time";

export default async function DashboardPage() {
  const { userId } = await requireCustomer();
  const now = new Date();
  const bookings = await prisma.$transaction(async (tx) => {
    await expireStaleHolds(tx, now);
    return tx.booking.findMany({
      where: {
        userId,
        status: { in: ["WAITING_PAYMENT", "CONFIRMED"] },
        startAt: { gte: now },
      },
      select: {
        id: true,
        code: true,
        packageNameSnapshot: true,
        startAt: true,
        status: true,
        payment: { select: { status: true } },
      },
      orderBy: { startAt: "asc" },
      take: 5,
    });
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Dashboard customer
          </h1>
          <p className="mt-2 text-muted-foreground">
            Lihat jadwal dan status booking Anda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="/packages" />}>Buat booking baru</Button>
          <Button
            variant="outline"
            render={<Link href="/dashboard/bookings" />}
          >
            Semua booking
          </Button>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Booking mendatang</h2>
          <Link
            href="/dashboard/bookings?tab=upcoming"
            className="text-sm font-medium text-primary hover:underline"
          >
            Lihat semua
          </Link>
        </div>
        {bookings.length ? (
          <ul className="mt-4 grid gap-3">
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
                      {formatStudioDateTime(
                        booking.startAt,
                        env.STUDIO_TIMEZONE,
                      )}
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
          <div className="mt-4 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Belum ada booking mendatang. Pilih package untuk membuat jadwal.
          </div>
        )}
      </section>

      <div className="mt-10 border-t pt-6">
        <form action={signOutCustomer}>
          <Button type="submit" variant="outline">
            Keluar
          </Button>
        </form>
      </div>
    </main>
  );
}
