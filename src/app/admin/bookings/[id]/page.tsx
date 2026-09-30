import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { cancelBookingAdminAction } from "@/modules/booking/admin-actions";
import { formatStudioDateTime } from "@/modules/scheduling/time";

export default async function AdminBookingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; cancelled?: string; refund?: string; providerCancel?: string }> }) {
  await requireAdmin();
  const [{ id }, notices] = await Promise.all([params, searchParams]);
  const booking = await prisma.booking.findUnique({ where: { id }, include: {
    user: { select: { id: true, name: true, email: true, phone: true } },
    package: { select: { name: true, durationMinutes: true, bufferMinutes: true } },
    payment: { include: { events: { orderBy: { receivedAt: "desc" }, take: 10, select: { eventKey: true, result: true, receivedAt: true } } } },
  } });
  if (!booking) notFound();
  const needsRefund = booking.status === "CANCELLED" && booking.payment?.status === "PAID";
  const errors: Record<string, string> = { invalid_state: "Status booking sudah berubah dan tidak dapat dibatalkan.", not_found: "Booking tidak ditemukan.", invalid_input: "Alasan pembatalan wajib diisi (minimal 3 karakter)." };
  return <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 sm:px-8">
    <Link className="text-sm text-muted-foreground hover:underline" href="/admin/bookings">← Daftar booking</Link>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight">{booking.code}</h1>
    {notices.error && <p role="alert" className="mt-4 rounded-md border border-destructive/50 p-3 text-sm text-destructive">{errors[notices.error] ?? "Pembatalan booking gagal."}</p>}
    {notices.cancelled && <p role="status" className="mt-4 rounded-md border border-primary/30 p-3 text-sm">Booking dibatalkan.{notices.refund === "required" ? " Payment sudah lunas; refund manual diperlukan." : ""}{notices.providerCancel === "failed" ? " QRIS provider perlu diperiksa dan dibatalkan manual." : ""}</p>}
    <p className="mt-2 text-sm">Status booking: <strong>{booking.status}</strong>{needsRefund && <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-amber-900">Perlu refund manual</span>}{booking.payment?.needsReview && <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-amber-900">Perlu review payment</span>}</p>
    <section className="mt-6 grid gap-4 sm:grid-cols-2">
      <article className="rounded-xl border p-5"><h2 className="font-semibold">Customer</h2><p className="mt-3">{booking.user.name}</p><p className="text-sm text-muted-foreground">{booking.user.email}</p><p className="text-sm text-muted-foreground">{booking.user.phone ?? "Nomor telepon belum diisi"}</p></article>
      <article className="rounded-xl border p-5"><h2 className="font-semibold">Jadwal dan package</h2><p className="mt-3">{booking.packageNameSnapshot}</p><p className="text-sm text-muted-foreground">{formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)} – {formatStudioDateTime(booking.endAt, env.STUDIO_TIMEZONE)}</p><p className="text-sm text-muted-foreground">{booking.package.durationMinutes} menit + buffer {booking.package.bufferMinutes} menit</p></article>
      <article className="rounded-xl border p-5 sm:col-span-2"><h2 className="font-semibold">Pembayaran</h2><p className="mt-3">{booking.payment?.status ?? "Belum dibuat"} · Rp{booking.payment?.amount.toLocaleString("id-ID") ?? booking.priceSnapshot.toLocaleString("id-ID")}</p>{booking.payment?.providerTransactionId && <p className="text-sm text-muted-foreground">Transaksi {booking.payment.providerTransactionId}</p>}{booking.payment?.events.length ? <ul className="mt-3 divide-y text-sm">{booking.payment.events.map((event) => <li className="py-2" key={`${event.eventKey}-${event.receivedAt.toISOString()}`}>{event.result} · {formatStudioDateTime(event.receivedAt, env.STUDIO_TIMEZONE)}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Belum ada event pembayaran.</p>}</article>
      {booking.customerNote && <article className="rounded-xl border p-5 sm:col-span-2"><h2 className="font-semibold">Catatan customer</h2><p className="mt-2 whitespace-pre-wrap text-sm">{booking.customerNote}</p></article>}
      {booking.cancelReason && <article className="rounded-xl border p-5 sm:col-span-2"><h2 className="font-semibold">Alasan pembatalan</h2><p className="mt-2 text-sm">{booking.cancelReason} · {booking.cancelledBy ?? "—"}</p></article>}
      {(booking.status === "WAITING_PAYMENT" || booking.status === "CONFIRMED") && <article className="rounded-xl border border-destructive/30 p-5 sm:col-span-2"><h2 className="font-semibold">Batalkan booking</h2><p className="mt-1 text-sm text-muted-foreground">Aksi ini permanen. Payment yang sudah lunas harus direfund secara manual.</p><form action={cancelBookingAdminAction} className="mt-4 flex flex-wrap items-end gap-3"><input type="hidden" name="bookingId" value={booking.id} /><label className="grid min-w-64 flex-1 gap-1 text-sm">Alasan pembatalan<input className="rounded-md border bg-background px-3 py-2" name="reason" minLength={3} maxLength={1000} required /></label><button className="h-10 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground" type="submit">Batalkan booking</button></form></article>}
    </section>
  </main>;
}
