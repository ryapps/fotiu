import Link from "next/link";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  saveOperatingHours,
} from "@/modules/scheduling/actions";
import { getScheduleBlockConflicts } from "@/modules/scheduling/availability-service";
import { formatStudioDateTime } from "@/modules/scheduling/time";

type AdminSchedulePageProps = {
  searchParams: Promise<{ error?: string; saved?: string; block?: string }>;
};

const weekdays = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const fieldClassName =
  "mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function AdminSchedulePage({
  searchParams,
}: AdminSchedulePageProps) {
  await requireAdmin();
  const [{ error, saved, block: blockId }, hours, blocks] = await Promise.all([
    searchParams,
    prisma.operatingHour.findMany({ orderBy: { weekday: "asc" } }),
    prisma.scheduleBlock.findMany({
      where: { endAt: { gt: new Date() } },
      orderBy: { startAt: "asc" },
      take: 50,
    }),
  ]);

  const hourByWeekday = new Map(hours.map((hour) => [hour.weekday, hour]));
  const conflictDetails = blockId
    ? await getScheduleBlockConflicts(blockId)
    : null;
  const errorMessages: Record<string, string> = {
    invalid_hours:
      "Jam operasional tidak valid. Pastikan semua hari lengkap dan jam tutup setelah jam buka.",
    invalid_block: "Blokir tidak valid. Periksa waktu dan alasannya.",
    not_found: "Blokir jadwal tidak ditemukan.",
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
      <Link
        className="text-sm text-muted-foreground hover:underline"
        href="/admin"
      >
        ← Dashboard admin
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Jam operasional dan blokir
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Waktu diatur menurut zona {env.STUDIO_TIMEZONE}. Perubahan berlaku pada
        perhitungan slot berikutnya.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
        >
          {errorMessages[error] ?? "Terjadi kesalahan. Coba lagi."}
        </p>
      )}
      {saved === "hours" && (
        <p
          role="status"
          className="mt-6 rounded-md border border-primary/30 p-3 text-sm"
        >
          Jam operasional berhasil disimpan.
        </p>
      )}
      {saved === "block_deleted" && (
        <p
          role="status"
          className="mt-6 rounded-md border border-primary/30 p-3 text-sm"
        >
          Blokir jadwal berhasil dihapus.
        </p>
      )}

      {blockId && conflictDetails && (
        <section
          className={`mt-6 rounded-lg border p-4 ${conflictDetails.bookings.length > 0 ? "border-amber-500/50 bg-amber-500/5" : "border-primary/30 bg-primary/5"}`}
          aria-live="polite"
        >
          {conflictDetails.bookings.length === 0 ? (
            <p className="text-sm">
              Blokir berhasil dibuat. Tidak ada booking aktif yang terdampak.
            </p>
          ) : (
            <>
              <h2 className="font-semibold">
                Blokir berhasil dibuat; {conflictDetails.bookings.length}{" "}
                booking aktif beririsan
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Booking tetap ada dan tidak dibatalkan otomatis.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {conflictDetails.bookings.map((booking) => (
                  <li
                    key={booking.code}
                    className="rounded-md border bg-background p-3"
                  >
                    <span className="font-medium">{booking.code}</span> ·{" "}
                    {booking.user.name} · {booking.packageNameSnapshot}
                    <div className="mt-1 text-muted-foreground">
                      {formatStudioDateTime(
                        booking.startAt,
                        env.STUDIO_TIMEZONE,
                      )}{" "}
                      –{" "}
                      {formatStudioDateTime(booking.endAt, env.STUDIO_TIMEZONE)}{" "}
                      ·{" "}
                      {booking.status === "CONFIRMED"
                        ? "Terkonfirmasi"
                        : "Menunggu pembayaran"}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="mt-10 rounded-xl border p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Jam operasional mingguan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Atur hari buka dan jam studio. Semua tujuh hari disimpan bersama.
        </p>
        <form action={saveOperatingHours} className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-3 font-medium">Hari</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Buka</th>
                  <th className="pb-3 font-medium">Tutup</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {weekdays.map((weekdayName, weekday) => {
                  const hour = hourByWeekday.get(weekday);
                  const isOpen = hour?.isOpen ?? weekday !== 0;
                  return (
                    <tr key={weekday}>
                      <th className="py-3 font-medium">{weekdayName}</th>
                      <td className="px-2 py-3">
                        <label
                          className="sr-only"
                          htmlFor={`day-${weekday}-isOpen`}
                        >
                          Status {weekdayName}
                        </label>
                        <select
                          id={`day-${weekday}-isOpen`}
                          name={`day-${weekday}-isOpen`}
                          defaultValue={isOpen ? "open" : "closed"}
                          className={fieldClassName}
                        >
                          <option value="open">Buka</option>
                          <option value="closed">Tutup</option>
                        </select>
                      </td>
                      <td className="px-2 py-3">
                        <label
                          className="sr-only"
                          htmlFor={`day-${weekday}-openTime`}
                        >
                          Jam buka {weekdayName}
                        </label>
                        <input
                          className={fieldClassName}
                          id={`day-${weekday}-openTime`}
                          name={`day-${weekday}-openTime`}
                          type="time"
                          required
                          defaultValue={hour?.openTime ?? "09:00"}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <label
                          className="sr-only"
                          htmlFor={`day-${weekday}-closeTime`}
                        >
                          Jam tutup {weekdayName}
                        </label>
                        <input
                          className={fieldClassName}
                          id={`day-${weekday}-closeTime`}
                          name={`day-${weekday}-closeTime`}
                          type="time"
                          required
                          defaultValue={hour?.closeTime ?? "17:00"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            className="mt-5 h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            type="submit"
          >
            Simpan jam operasional
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-xl border p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Blokir jadwal</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Blokir dapat bertumpang tindih dengan booking. Sistem akan menampilkan
          peringatan tanpa membatalkannya.
        </p>
        <form
          action={createScheduleBlock}
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <label className="text-sm font-medium">
            Mulai ({env.STUDIO_TIMEZONE})
            <input
              className={fieldClassName}
              name="startAt"
              type="datetime-local"
              required
            />
          </label>
          <label className="text-sm font-medium">
            Selesai ({env.STUDIO_TIMEZONE})
            <input
              className={fieldClassName}
              name="endAt"
              type="datetime-local"
              required
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Alasan
            <input
              className={fieldClassName}
              name="reason"
              maxLength={200}
              required
              placeholder="Libur studio atau maintenance"
            />
          </label>
          <div>
            <button
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              type="submit"
            >
              Buat blokir
            </button>
          </div>
        </form>

        <h3 className="mt-8 font-semibold">Blokir mendatang</h3>
        {blocks.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Belum ada blokir mendatang.
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-lg border">
            {blocks.map((scheduleBlock) => (
              <li
                key={scheduleBlock.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-medium">{scheduleBlock.reason}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatStudioDateTime(
                      scheduleBlock.startAt,
                      env.STUDIO_TIMEZONE,
                    )}{" "}
                    –{" "}
                    {formatStudioDateTime(
                      scheduleBlock.endAt,
                      env.STUDIO_TIMEZONE,
                    )}
                  </p>
                </div>
                <form action={deleteScheduleBlock}>
                  <input type="hidden" name="id" value={scheduleBlock.id} />
                  <button
                    className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary"
                    type="submit"
                  >
                    Hapus blokir
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
