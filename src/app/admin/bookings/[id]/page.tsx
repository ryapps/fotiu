import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import {
  cancelBookingAdminAction,
  markPaymentRefundedAdminAction,
  rescheduleBookingAdminAction,
} from "@/modules/booking/admin-actions";
import {
  assignBoothAction,
  checkInBookingAction,
  completeBookingPhotoboothAction,
  startPhotoSessionAction,
} from "@/modules/photobooth/actions";
import { getBoothReadStatus } from "@/modules/photobooth/domain";
import {
  PHOTO_SESSION_BUFFER_MINUTES,
  getBookedSessionDurationMinutes,
  getCheckInWindowMinutes,
  isWithinPhotoSessionWindow,
} from "@/modules/scheduling/session-duration";
import { formatStudioDateTime } from "@/modules/scheduling/time";
import Link from "next/link";
import { notFound } from "next/navigation";

type SessionRow = {
  id: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  completionSource: string | null;
  completionReason: string | null;
  updatedAt: Date;
  boothName: string;
  deviceId: string;
  providerKey: string;
  commandStatus: string | null;
};

type BoothRow = {
  id: string;
  name: string;
  deviceId: string;
  isMaintenance: boolean;
  lastSeenAt: Date | null;
  hasActiveSession: boolean;
};

function localDateTimeInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: env.STUDIO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string) =>
    parts.find((part) => part.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default async function AdminBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    refunded?: string;
    cancelled?: string;
    refund?: string;
    providerCancel?: string;
    session?: string;
    rescheduled?: string;
    checkedIn?: string;
    assigned?: string;
    started?: string;
    completed?: string;
  }>;
}) {
  await requireAdmin();
  const [{ id }, notices] = await Promise.all([params, searchParams]);
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      package: {
        select: { name: true },
      },
      payment: {
        include: {
          refundedByAdmin: { select: { name: true, email: true } },
          events: {
            orderBy: { receivedAt: "desc" },
            take: 10,
            select: { eventKey: true, result: true, receivedAt: true },
          },
        },
      },
    },
  });
  if (!booking) notFound();
  const [sessions, booths] = await Promise.all([
    prisma.$queryRaw<SessionRow[]>`
      SELECT session."id", session."status", session."createdAt", session."startedAt", session."completedAt", session."failedAt",
        session."completionSource", session."completionReason", session."updatedAt", booth."name" AS "boothName", booth."deviceId",
        session."providerKey",
        command."status" AS "commandStatus"
      FROM "photo_sessions" session JOIN "booths" booth ON booth."id" = session."boothId"
      LEFT JOIN "booth_commands" command ON command."photoSessionId" = session."id" AND command."type" = 'START_SESSION'
      WHERE session."bookingId" = ${booking.id}
      ORDER BY session."createdAt" DESC
    `,
    prisma.$queryRaw<BoothRow[]>`
      SELECT booth."id", booth."name", booth."deviceId", booth."isMaintenance", booth."lastSeenAt",
        EXISTS (SELECT 1 FROM "photo_sessions" session WHERE session."boothId" = booth."id"
          AND session."status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')) AS "hasActiveSession"
      FROM "booths" booth ORDER BY booth."name", booth."deviceId"
    `,
  ]);
  const now = new Date();
  const bookedDurationMinutes = getBookedSessionDurationMinutes(
    booking.startAt,
    booking.endAt,
  );
  const checkInWindowMinutes = getCheckInWindowMinutes(
    booking.startAt,
    booking.endAt,
  );
  const checkInWindowOpen = isWithinPhotoSessionWindow(
    now,
    booking.startAt,
    booking.endAt,
  );
  const onlineBooths = booths.filter(
    (booth) =>
      getBoothReadStatus({
        isMaintenance: booth.isMaintenance,
        lastSeenAt: booth.lastSeenAt,
        hasActiveSession: booth.hasActiveSession,
        now,
        heartbeatTimeoutSeconds: env.BOOTH_HEARTBEAT_TIMEOUT_SECONDS,
      }) === "ONLINE",
  );
  const hasCompletedSession = sessions.some(
    (session) => session.status === "COMPLETED",
  );
  const recoverableSession = sessions.find((session) =>
    ["STARTING", "ACTIVE", "PROCESSING"].includes(session.status),
  );
  const needsRefund =
    booking.status === "CANCELLED" && booking.payment?.status === "PAID";
  const errors: Record<string, string> = {
    invalid_state: "Status booking sudah berubah dan tidak dapat dibatalkan.",
    not_found: "Booking tidak ditemukan.",
    invalid_input: "Alasan pembatalan wajib diisi (minimal 3 karakter).",
    refund_invalid_input: "Alasan refund wajib diisi (minimal 3 karakter).",
    refund_invalid_state:
      "Hanya payment PAID dari booking CANCELLED yang dapat ditandai refunded.",
    refund_not_found: "Payment tidak ditemukan.",
    stale:
      "Jadwal booking baru saja diubah admin lain. Muat ulang sebelum mencoba lagi.",
    conflict: "Slot tujuan tidak tersedia atau di luar jam operasional.",
    invalid: "Waktu tujuan tidak valid.",
    invalid_reschedule: "Input reschedule tidak valid.",
    checkin_invalid_state:
      "Hanya booking CONFIRMED dengan payment PAID yang dapat check-in.",
    checkin_outside_schedule: `Check-in hanya dapat dilakukan selama ${checkInWindowMinutes} menit sejak jadwal sesi dimulai.`,
    checkin_already_checked_in: "Booking ini sudah check-in.",
    assignment_invalid_state: `Booking harus CONFIRMED, lunas, sudah check-in, dan sesi belum melewati ${checkInWindowMinutes} menit.`,
    assignment_booth_unavailable: "Booth sedang offline atau maintenance.",
    assignment_session_active:
      "Booth atau booking masih memiliki photo session aktif.",
    assignment_conflict:
      "Booth atau booking baru saja mendapat assignment lain. Muat ulang halaman.",
    assignment_not_found: "Booth atau booking tidak ditemukan.",
    assignment_invalid_input: "Data assignment tidak valid.",
    start_invalid_state: `Booking harus lunas, sudah check-in, dan sesi belum melewati ${checkInWindowMinutes} menit.`,
    start_invalid_transition:
      "Photo session ini sudah dimulai atau berada pada status terminal.",
    start_booth_unavailable:
      "Booth offline atau sedang maintenance; sesi tidak dimulai.",
    start_session_active: "Booth memiliki photo session lain yang masih aktif.",
    start_conflict: "Command sesi sudah berubah; muat ulang halaman.",
    complete_invalid_input: "Data penyelesaian tidak valid.",
    complete_invalid_state:
      "Hanya booking CONFIRMED + PAID yang sudah check-in dapat diselesaikan.",
    complete_outside_schedule: "Booking belum mencapai waktu mulai.",
    complete_session_not_completed:
      "Photo session belum COMPLETED; gunakan recovery hanya setelah memverifikasi sesi benar-benar selesai.",
    complete_session_not_active:
      "Tidak ada photo session aktif yang dapat direkonsiliasi.",
    complete_session_failed:
      "Photo session FAILED bersifat terminal dan tidak dapat ditandai selesai. Buat attempt baru setelah booth diperiksa.",
    complete_invalid_transition:
      "Status booking/session berubah. Muat ulang halaman.",
  };
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 sm:px-8">
      <header className="rounded-[1.75rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-6 shadow-[0_20px_54px_rgba(40,80,150,0.07)] sm:p-8">
        <Link
          className="text-sm font-medium text-primary hover:underline"
          href="/admin/bookings"
        >
          ← Daftar booking
        </Link>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Detail operasional
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {booking.code}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {booking.user.name} ·{" "}
          {formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)}
        </p>
      </header>
      {notices.error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
        >
          {errors[notices.error] ?? "Pembatalan booking gagal."}
        </p>
      )}
      {notices.cancelled && (
        <p
          role="status"
          className="mt-4 rounded-md border border-primary/30 p-3 text-sm"
        >
          Booking dibatalkan.
          {notices.refund === "required"
            ? " Payment sudah lunas; refund manual diperlukan."
            : ""}
          {notices.providerCancel === "failed"
            ? " QRIS provider perlu diperiksa dan dibatalkan manual."
            : ""}
          {notices.session === "continues"
            ? " Photo session aktif atau command START_SESSION yang sedang diproses tidak dihentikan otomatis; booth tetap di-reserve sampai hasilnya direkonsiliasi."
            : ""}
        </p>
      )}
      {notices.refunded && (
        <p
          role="status"
          className="mt-4 rounded-md border border-primary/30 p-3 text-sm"
        >
          Refund manual tercatat. Pastikan dana memang sudah dikembalikan
          melalui kanal pembayaran.
        </p>
      )}
      {notices.rescheduled && (
        <p
          role="status"
          className="mt-4 rounded-md border border-primary/30 p-3 text-sm"
        >
          Jadwal booking berhasil dipindahkan.
        </p>
      )}
      {(notices.checkedIn ||
        notices.assigned ||
        notices.started ||
        notices.completed) && (
        <p
          role="status"
          className="mt-4 rounded-md border border-primary/30 p-3 text-sm"
        >
          {notices.completed
            ? notices.completed === "manual"
              ? "Booking diselesaikan melalui manual recovery; alasan, admin, dan waktu tersimpan pada photo session."
              : "Booking diselesaikan setelah photo session COMPLETED."
            : notices.checkedIn
              ? "Customer berhasil check-in."
              : notices.assigned
                ? "Booth berhasil di-assign; photo session berstatus READY."
                : notices.started === "manual"
                  ? "Sesi FreeBooth dicatat dimulai secara manual; sesi tetap aktif sampai admin memverifikasi dan mencatat penyelesaiannya."
                  : "Command START_SESSION sudah masuk antrean agent. Status session menunggu normalized event."}
        </p>
      )}
      <p className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        Status booking:
        <strong className="rounded-full bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
          {booking.status}
        </strong>
        {needsRefund && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
            Perlu refund manual
          </span>
        )}
        {booking.payment?.needsReview && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
            Perlu review payment
          </span>
        )}
      </p>
      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)]">
          <h2 className="font-semibold">Customer</h2>
          <p className="mt-3">{booking.user.name}</p>
          <p className="text-sm text-muted-foreground">{booking.user.email}</p>
          <p className="text-sm text-muted-foreground">
            {booking.user.phone ?? "Nomor telepon belum diisi"}
          </p>
        </article>
        <article className="rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)]">
          <h2 className="font-semibold">Jadwal dan package</h2>
          <p className="mt-3">{booking.packageNameSnapshot}</p>
          <p className="text-sm text-muted-foreground">
            {formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)} –{" "}
            {formatStudioDateTime(booking.endAt, env.STUDIO_TIMEZONE)}
          </p>
          <p className="text-sm text-muted-foreground">
            Sesi {bookedDurationMinutes} menit + jeda{" "}
            {PHOTO_SESSION_BUFFER_MINUTES} menit
          </p>
        </article>
        <article className="rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)] sm:col-span-2">
          <h2 className="font-semibold">Pembayaran</h2>
          <p className="mt-3">
            {booking.payment?.status ?? "Belum dibuat"} · Rp
            {booking.payment?.amount.toLocaleString("id-ID") ??
              booking.priceSnapshot.toLocaleString("id-ID")}
          </p>
          {booking.payment?.providerTransactionId && (
            <p className="text-sm text-muted-foreground">
              Transaksi {booking.payment.providerTransactionId}
            </p>
          )}
          {booking.payment?.status === "REFUNDED" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Refund: {booking.payment.refundReason} ·{" "}
              {booking.payment.refundedAt
                ? formatStudioDateTime(
                    booking.payment.refundedAt,
                    env.STUDIO_TIMEZONE,
                  )
                : "—"}{" "}
              ·{" "}
              {booking.payment.refundedByAdmin?.name ?? "Admin tidak diketahui"}
            </p>
          )}
          {needsRefund && booking.payment && (
            <form
              action={markPaymentRefundedAdminAction}
              className="mt-4 grid gap-3 rounded-lg border border-amber-500/40 p-4"
            >
              <input
                type="hidden"
                name="paymentId"
                value={booking.payment.id}
              />
              <input type="hidden" name="bookingId" value={booking.id} />
              <p className="text-sm">
                Gunakan setelah refund benar-benar dilakukan di luar aplikasi.
                Status ini hanya mencatat hasil refund manual.
              </p>
              <label className="grid gap-1 text-sm">
                Alasan / referensi refund
                <textarea
                  className="min-h-20 rounded-md border bg-background px-3 py-2"
                  name="reason"
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
              <button
                className="h-10 w-fit rounded-md border border-amber-600/50 px-4 text-sm font-medium hover:bg-secondary"
                type="submit"
              >
                Catat refund selesai
              </button>
            </form>
          )}
          {booking.payment?.events.length ? (
            <ul className="mt-3 divide-y text-sm">
              {booking.payment.events.map((event) => (
                <li
                  className="py-2"
                  key={`${event.eventKey}-${event.receivedAt.toISOString()}`}
                >
                  {event.result} ·{" "}
                  {formatStudioDateTime(event.receivedAt, env.STUDIO_TIMEZONE)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Belum ada event pembayaran.
            </p>
          )}
        </article>
        {booking.customerNote && (
          <article className="rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)] sm:col-span-2">
            <h2 className="font-semibold">Catatan customer</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {booking.customerNote}
            </p>
          </article>
        )}
        {booking.cancelReason && (
          <article className="rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)] sm:col-span-2">
            <h2 className="font-semibold">Alasan pembatalan</h2>
            <p className="mt-2 text-sm">
              {booking.cancelReason} · {booking.cancelledBy ?? "—"}
            </p>
          </article>
        )}
        <article className="rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)] sm:col-span-2">
          <h2 className="font-semibold">Check-in dan photo session</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Check-in dan mulai sesi tersedia selama {checkInWindowMinutes} menit
            sejak waktu mulai booking. Slot berikutnya dimulai setelah jeda{" "}
            {PHOTO_SESSION_BUFFER_MINUTES} menit.
            {formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)}–
            {formatStudioDateTime(booking.endAt, env.STUDIO_TIMEZONE)}.
          </p>
          {booking.checkedInAt ? (
            <p className="mt-3 text-sm">
              Check-in:{" "}
              {formatStudioDateTime(booking.checkedInAt, env.STUDIO_TIMEZONE)}
            </p>
          ) : booking.status === "CONFIRMED" && checkInWindowOpen ? (
            <form action={checkInBookingAction} className="mt-3">
              <input type="hidden" name="bookingId" value={booking.id} />
              <button
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                type="submit"
              >
                Check-in customer
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm">
              {booking.status === "CONFIRMED"
                ? now < booking.startAt
                  ? `Check-in baru tersedia mulai ${formatStudioDateTime(booking.startAt, env.STUDIO_TIMEZONE)}.`
                  : `Waktu check-in ${checkInWindowMinutes} menit untuk booking ini sudah lewat.`
                : "Check-in tidak tersedia untuk status booking ini."}
            </p>
          )}
          {booking.checkedInAt &&
            checkInWindowOpen &&
            onlineBooths.length > 0 && (
              <form
                action={assignBoothAction}
                className="mt-4 flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="bookingId" value={booking.id} />
                <label className="grid gap-1 text-sm">
                  Booth ONLINE
                  <select
                    className="h-10 min-w-56 rounded-md border bg-background px-3"
                    name="boothId"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Pilih booth
                    </option>
                    {onlineBooths.map((booth) => (
                      <option value={booth.id} key={booth.id}>
                        {booth.name} · {booth.deviceId}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-secondary"
                  type="submit"
                >
                  Assign booth
                </button>
              </form>
            )}
          {sessions.length ? (
            <ul className="mt-5 divide-y divide-border/80 rounded-xl border border-primary/10 bg-white/70 px-3">
              {sessions.map((session) => (
                <li className="py-3 text-sm" key={session.id}>
                  <p>
                    <strong>{session.status}</strong> · {session.boothName} (
                    {session.deviceId}) ·{" "}
                    {formatStudioDateTime(
                      session.createdAt,
                      env.STUDIO_TIMEZONE,
                    )}
                  </p>
                  {session.providerKey === "freebooth" &&
                  session.status === "ACTIVE" ? (
                    <p className="mt-1 text-muted-foreground">
                      Sesi dimulai operator di FreeBooth (tanpa command agent).
                    </p>
                  ) : session.commandStatus ? (
                    <p className="mt-1 text-muted-foreground">
                      Command START_SESSION: {session.commandStatus}
                    </p>
                  ) : null}
                  {session.status === "STARTING" &&
                    session.commandStatus &&
                    session.commandStatus !== "PENDING" && (
                      <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-900 dark:text-amber-200">
                        Hasil sesi belum diketahui. Periksa kondisi booth dan
                        agent secara manual; jangan kirim ulang command ini.
                        Waktu perubahan terakhir:{" "}
                        {formatStudioDateTime(
                          session.updatedAt,
                          env.STUDIO_TIMEZONE,
                        )}
                        .
                      </p>
                    )}
                  {session.status === "READY" &&
                    booking.status === "CONFIRMED" &&
                    booking.payment?.status === "PAID" &&
                    booking.checkedInAt &&
                    checkInWindowOpen && (
                      <form action={startPhotoSessionAction} className="mt-3">
                        <input
                          type="hidden"
                          name="photoSessionId"
                          value={session.id}
                        />
                        <input
                          type="hidden"
                          name="bookingId"
                          value={booking.id}
                        />
                        <button
                          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                          type="submit"
                        >
                          {session.providerKey === "freebooth"
                            ? "Catat sesi dimulai di FreeBooth"
                            : session.providerKey === "photobooth_app"
                              ? "Mulai sesi Photobooth-App"
                              : "Mulai sesi mock"}
                        </button>
                      </form>
                    )}
                  {session.providerKey === "freebooth" &&
                    session.status === "READY" && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Jalankan FreeBooth langsung di komputer booth terlebih
                        dahulu, lalu catat sesi dimulai di sini.{" "}
                        <a
                          className="underline"
                          href="https://www.free-booth.com/"
                          rel="noreferrer"
                          target="_blank"
                        >
                          Panduan FreeBooth
                        </a>
                      </p>
                    )}
                  {session.completionSource && (
                    <p className="mt-1 text-muted-foreground">
                      Sumber completion: {session.completionSource}
                      {session.completionReason
                        ? ` · ${session.completionReason}`
                        : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Belum ada photo session.
            </p>
          )}
          {booking.status === "CONFIRMED" &&
            now >= booking.startAt &&
            hasCompletedSession && (
              <form action={completeBookingPhotoboothAction} className="mt-4">
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="mode" value="session" />
                <button
                  className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  type="submit"
                >
                  Selesaikan booking
                </button>
              </form>
            )}
          {booking.status === "CONFIRMED" &&
            now >= booking.startAt &&
            !hasCompletedSession &&
            recoverableSession && (
              <form
                action={completeBookingPhotoboothAction}
                className="mt-5 rounded-lg border border-amber-500/40 p-4"
              >
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="mode" value="manual" />
                <h3 className="font-medium">Manual recovery</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gunakan hanya setelah memeriksa booth dan memastikan sesi
                  fisik benar-benar selesai. Command/provider status saja bukan
                  bukti completion.
                </p>
                <label className="mt-3 grid gap-1 text-sm">
                  Alasan dan hasil pemeriksaan
                  <textarea
                    className="min-h-20 rounded-md border bg-background px-3 py-2"
                    name="reason"
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                </label>
                <button
                  className="mt-3 h-10 rounded-md border border-amber-600/50 px-4 text-sm font-medium hover:bg-secondary"
                  type="submit"
                >
                  Konfirmasi recovery selesai
                </button>
              </form>
            )}
        </article>
        {booking.status === "CONFIRMED" && (
          <article className="rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)] sm:col-span-2">
            <h2 className="font-semibold">Pindahkan jadwal</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sesi {bookedDurationMinutes} menit + jeda{" "}
              {PHOTO_SESSION_BUFFER_MINUTES} menit. Zona waktu:{" "}
              {env.STUDIO_TIMEZONE}.
            </p>
            <form
              action={rescheduleBookingAdminAction}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="bookingId" value={booking.id} />
              <input
                type="hidden"
                name="expectedStartAt"
                value={booking.startAt.toISOString()}
              />
              <label className="grid gap-1 text-sm">
                Waktu mulai baru
                <input
                  className="rounded-md border bg-background px-3 py-2"
                  type="datetime-local"
                  name="newStartAt"
                  defaultValue={localDateTimeInput(booking.startAt)}
                  required
                />
              </label>
              <button
                className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-secondary"
                type="submit"
              >
                Simpan jadwal
              </button>
            </form>
          </article>
        )}
        {(booking.status === "WAITING_PAYMENT" ||
          booking.status === "CONFIRMED") && (
          <article className="rounded-xl border border-destructive/30 p-5 sm:col-span-2">
            <h2 className="font-semibold">Batalkan booking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Aksi ini permanen. Payment yang sudah lunas harus direfund secara
              manual.
            </p>
            <form
              action={cancelBookingAdminAction}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="bookingId" value={booking.id} />
              <label className="grid min-w-64 flex-1 gap-1 text-sm">
                Alasan pembatalan
                <input
                  className="rounded-md border bg-background px-3 py-2"
                  name="reason"
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
              <button
                className="h-10 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground"
                type="submit"
              >
                Batalkan booking
              </button>
            </form>
          </article>
        )}
      </section>
    </main>
  );
}
