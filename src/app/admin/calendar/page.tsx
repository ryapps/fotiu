import Link from "next/link";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { localDayBoundsUtc, getLocalDate, formatStudioDateTime } from "@/modules/scheduling/time";

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 9998) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const date = validDate(params.date) ? params.date : getLocalDate(new Date(), env.STUDIO_TIMEZONE);
  const bounds = localDayBoundsUtc(date, env.STUDIO_TIMEZONE);
  const bookings = await prisma.booking.findMany({ where: { startAt: { lt: bounds.end }, endAt: { gt: bounds.start }, status: { in: ["WAITING_PAYMENT", "CONFIRMED"] } }, orderBy: { startAt: "asc" }, select: { id: true, code: true, startAt: true, endAt: true, status: true, packageNameSnapshot: true, user: { select: { name: true } }, payment: { select: { status: true } } } });
  return <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8"><Link className="text-sm text-muted-foreground hover:underline" href="/admin">← Dashboard admin</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight">Kalender booking</h1><form className="mt-5 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Tanggal ({env.STUDIO_TIMEZONE})<input className="rounded-md border bg-background px-3 py-2" type="date" name="date" defaultValue={date} /></label><button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">Lihat</button></form>{bookings.length === 0 ? <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Tidak ada booking aktif pada tanggal ini.</p> : <ol className="mt-6 space-y-3">{bookings.map((booking) => <li key={booking.id} className="rounded-xl border p-4"><Link className="font-medium hover:underline" href={`/admin/bookings/${booking.id}`}>{booking.code}</Link><span className="ml-2 rounded-full border px-2 py-1 text-xs">{booking.status}</span><p className="mt-2 text-sm">{formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)} – {formatStudioDateTime(booking.endAt, env.STUDIO_TIMEZONE)} · {booking.packageNameSnapshot}</p><p className="text-sm text-muted-foreground">{booking.user.name} · {booking.payment?.status ?? "Tanpa payment"}</p></li>)}</ol>}</main>;
}
