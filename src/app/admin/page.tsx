import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import {
  formatStudioDateTime,
  getLocalDate,
  localDayBoundsUtc,
} from "@/modules/scheduling/time";
import { BookingStatus } from "@prisma/client";
import Link from "next/link";

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const statusLabels: Record<BookingStatus, string> = {
  WAITING_PAYMENT: "Menunggu pembayaran",
  CONFIRMED: "Dikonfirmasi",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
  COMPLETED: "Selesai",
};

export default async function AdminDashboardPage() {
  await requireAdmin();
  const now = new Date();
  const today = getLocalDate(now, env.STUDIO_TIMEZONE);
  const todayBounds = localDayBoundsUtc(today, env.STUDIO_TIMEZONE);
  const month = `${today.slice(0, 7)}-01`;
  const nextMonth = new Date(`${month}T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthBounds = {
    start: localDayBoundsUtc(month, env.STUDIO_TIMEZONE).start,
    end: localDayBoundsUtc(
      `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`,
      env.STUDIO_TIMEZONE,
    ).start,
  };
  const [statusGroups, revenue, todaySessions, upcomingSessions, attention] =
    await Promise.all([
      prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.payment.aggregate({
        where: {
          status: "PAID",
          paidAt: { gte: monthBounds.start, lt: monthBounds.end },
        },
        _sum: { amount: true },
      }),
      prisma.booking.findMany({
        where: {
          startAt: { gte: todayBounds.start, lt: todayBounds.end },
          status: { in: ["CONFIRMED", "COMPLETED"] },
        },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: 8,
        select: {
          id: true,
          code: true,
          startAt: true,
          status: true,
          packageNameSnapshot: true,
          user: { select: { name: true } },
        },
      }),
      prisma.booking.findMany({
        where: {
          startAt: { gte: todayBounds.end },
          status: "CONFIRMED",
        },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: 8,
        select: {
          id: true,
          code: true,
          startAt: true,
          packageNameSnapshot: true,
          user: { select: { name: true } },
        },
      }),
      prisma.booking.findMany({
        where: {
          OR: [
            { payment: { is: { needsReview: true } } },
            { status: "CANCELLED", payment: { is: { status: "PAID" } } },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 8,
        select: {
          id: true,
          code: true,
          status: true,
          updatedAt: true,
          user: { select: { name: true } },
          payment: { select: { status: true, needsReview: true } },
        },
      }),
    ]);
  const counts = new Map(
    statusGroups.map(({ status, _count }) => [status, _count._all]),
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="overflow-hidden rounded-[2rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-6 shadow-[0_24px_64px_rgba(40,80,150,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
              Admin panel
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              Dashboard admin
            </h1>
            <p className="mt-2 text-muted-foreground">
              Ringkasan booking dan operasional studio.
            </p>
          </div>
        </div>
      </header>

      <section
        aria-label="Ringkasan booking"
        className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {Object.values(BookingStatus).map((status) => (
          <Link
            key={status}
            href={`/admin/bookings?status=${status}`}
            className="rounded-2xl border border-primary/10 bg-white/80 p-4 shadow-[0_12px_28px_rgba(37,74,138,0.05)] transition-transform hover:-translate-y-0.5 hover:bg-primary/5"
          >
            <p className="text-sm text-muted-foreground">
              {statusLabels[status]}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {counts.get(status) ?? 0}
            </p>
          </Link>
        ))}
      </section>

      <section className="mt-4 rounded-2xl border border-primary/10 bg-gradient-to-r from-[#eff7ff] to-white p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)]">
        <h2 className="font-semibold">Pendapatan bulan ini</h2>
        <p className="mt-2 text-2xl font-semibold text-primary">
          {currency.format(revenue._sum.amount ?? 0)}
        </p>
        <p className="text-sm text-muted-foreground">
          Pembayaran lunas berdasarkan waktu pembayaran studio.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <BookingList
          title="Sesi hari ini"
          empty="Belum ada booking terkonfirmasi hari ini."
          bookings={todaySessions}
        />
        <BookingList
          title="Sesi mendatang"
          empty="Belum ada booking mendatang."
          bookings={upcomingSessions}
        />
      </div>

      <section className="mt-8 rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Perlu perhatian</h2>
          <Link
            className="text-sm font-medium text-primary hover:underline"
            href="/admin/bookings"
          >
            Semua booking
          </Link>
        </div>
        {attention.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Tidak ada booking yang perlu direview atau refund.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border/80">
            {attention.map((booking) => (
              <li key={booking.id} className="py-3">
                <Link
                  className="font-medium text-primary hover:underline"
                  href={`/admin/bookings/${booking.id}`}
                >
                  {booking.code} · {booking.user.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {booking.payment?.needsReview
                    ? "Perlu review payment"
                    : "Perlu refund manual"}
                  {booking.payment?.status === "PAID" ? " · Lunas" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

type BookingRow = {
  id: string;
  code: string;
  startAt: Date;
  packageNameSnapshot: string;
  user: { name: string };
  status?: BookingStatus;
};

function BookingList({
  title,
  empty,
  bookings,
}: {
  title: string;
  empty: string;
  bookings: BookingRow[];
}) {
  return (
    <section className="rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)]">
      <h2 className="text-lg font-semibold">{title}</h2>
      {bookings.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border/80">
          {bookings.map((booking) => (
            <li key={booking.id} className="py-3">
              <Link
                className="font-medium text-primary hover:underline"
                href={`/admin/bookings/${booking.id}`}
              >
                {formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)} ·{" "}
                {booking.user.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {booking.code} · {booking.packageNameSnapshot}
                {booking.status ? ` · ${statusLabels[booking.status]}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
