import Link from "next/link";
import { BookingStatus } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { localDayBoundsUtc, formatStudioDateTime } from "@/modules/scheduling/time";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const statuses = Object.values(BookingStatus);
const pageSize = 20;
const inputClass = "rounded-md border bg-background px-3 py-2 text-sm";
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 9998) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function AdminBookingsPage({ searchParams }: Props) {
  await requireAdmin();
  const params = await searchParams;
  const statusParam = typeof params.status === "string" ? params.status : "";
  const status = statuses.find((item) => item === statusParam);
  const from = validDate(params.from) ? params.from : undefined;
  const to = validDate(params.to) ? params.to : undefined;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const hasInputError = params.error === "invalid_input";
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1));
  const startRange = from ? localDayBoundsUtc(from, env.STUDIO_TIMEZONE).start : undefined;
  const endRange = to ? localDayBoundsUtc(to, env.STUDIO_TIMEZONE).end : undefined;
  const where = {
    ...(status ? { status } : {}),
    ...(startRange || endRange ? { startAt: { ...(startRange ? { gte: startRange } : {}), ...(endRange ? { lt: endRange } : {}) } } : {}),
    ...(query ? { OR: [
      { code: { contains: query, mode: "insensitive" as const } },
      { user: { name: { contains: query, mode: "insensitive" as const } } },
      { user: { email: { contains: query, mode: "insensitive" as const } } },
    ] } : {}),
  };
  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({ where, orderBy: [{ startAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, code: true, startAt: true, status: true, packageNameSnapshot: true, user: { select: { name: true, email: true } }, payment: { select: { status: true, needsReview: true } } } }),
    prisma.booking.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filterHref = (nextPage: number) => {
    const values = new URLSearchParams();
    if (status) values.set("status", status);
    if (from) values.set("from", from);
    if (to) values.set("to", to);
    if (query) values.set("q", query);
    values.set("page", String(nextPage));
    return `/admin/bookings?${values.toString()}`;
  };
  return <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
    <Link className="text-sm text-muted-foreground hover:underline" href="/admin">← Dashboard admin</Link>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight">Booking</h1>
    {hasInputError && <p role="alert" className="mt-4 rounded-md border border-destructive/50 p-3 text-sm text-destructive">Alasan pembatalan wajib diisi (minimal 3 karakter).</p>}
    <form className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border p-4">
      <label className="grid gap-1 text-sm">Status<select className={inputClass} name="status" defaultValue={status ?? "ALL"}><option value="ALL">Semua</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Dari<input className={inputClass} type="date" name="from" defaultValue={from} /></label>
      <label className="grid gap-1 text-sm">Sampai<input className={inputClass} type="date" name="to" defaultValue={to} /></label>
      <label className="grid gap-1 text-sm">Cari kode, nama, email<input className={inputClass} name="q" maxLength={100} defaultValue={query} /></label>
      <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">Terapkan</button>
    </form>
    {bookings.length === 0 ? <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Tidak ada booking yang cocok.</p> : <div className="mt-6 overflow-x-auto rounded-xl border"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3">Kode / waktu</th><th className="p-3">Customer</th><th className="p-3">Package</th><th className="p-3">Status</th><th className="p-3">Payment</th></tr></thead><tbody className="divide-y">{bookings.map((booking) => <tr key={booking.id}><td className="p-3"><Link className="font-medium hover:underline" href={`/admin/bookings/${booking.id}`}>{booking.code}</Link><div className="mt-1 text-muted-foreground">{formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)}</div></td><td className="p-3">{booking.user.name}<div className="text-muted-foreground">{booking.user.email}</div></td><td className="p-3">{booking.packageNameSnapshot}</td><td className="p-3">{booking.status}</td><td className="p-3">{booking.payment?.status ?? "—"}{booking.payment?.needsReview && <div className="text-amber-700">Perlu review</div>}{booking.status === "CANCELLED" && booking.payment?.status === "PAID" && <div className="text-amber-700">Perlu refund</div>}</td></tr>)}</tbody></table></div>}
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginasi"><span className="text-muted-foreground">{total} booking · halaman {page} dari {pages}</span><div className="flex gap-2">{page > 1 && <Link className="rounded-md border px-3 py-2" href={filterHref(page - 1)}>Sebelumnya</Link>}{page < pages && <Link className="rounded-md border px-3 py-2" href={filterHref(page + 1)}>Berikutnya</Link>}</div></nav>
  </main>;
}
