import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/modules/auth/guards";
import { createBookingAction } from "@/modules/booking/actions";
import { createBookingInputSchema } from "@/modules/booking/schema";
import { getPackageAvailability } from "@/modules/scheduling/availability-service";
import { formatStudioDateTime, getLocalDate } from "@/modules/scheduling/time";

type BookPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ startAt?: string; error?: string }>;
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const errorMessages: Record<string, string> = {
  conflict:
    "Slot ini baru saja dipesan atau tidak lagi tersedia. Pilih slot lain.",
  hold_limit:
    "Anda sudah memiliki jumlah booking menunggu pembayaran maksimum.",
  not_found: "Paket tidak lagi tersedia.",
  invalid: "Data booking tidak valid. Silakan pilih slot kembali.",
  rate_limited: "Terlalu banyak percobaan booking. Tunggu sebentar lalu coba lagi.",
};

export default async function BookPage({
  params,
  searchParams,
}: BookPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const parsed = createBookingInputSchema.safeParse({
    packageId: "pending",
    startAt: query.startAt,
  });
  const safeStartAt = parsed.success ? parsed.data.startAt : undefined;
  await requireCustomer(
    safeStartAt
      ? `/packages/${slug}/book?startAt=${encodeURIComponent(safeStartAt)}`
      : `/packages/${slug}/book`,
  );

  const photoPackage = await prisma.package.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
    },
  });
  if (!photoPackage) notFound();
  if (!safeStartAt) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
        <h1 className="text-2xl font-semibold">Pilih slot booking</h1>
        <p className="mt-3 text-muted-foreground">
          Tanggal atau waktu tidak valid.
        </p>
        <Link
          className="mt-5 inline-block text-primary hover:underline"
          href={`/packages/${slug}`}
        >
          Kembali pilih jadwal
        </Link>
      </main>
    );
  }

  const startAt = new Date(safeStartAt);
  const date = getLocalDate(startAt, env.STUDIO_TIMEZONE);
  const availability = await getPackageAvailability(photoPackage.id, date);
  const slot = availability?.slots.find(
    (candidate) => new Date(candidate.startAt).getTime() === startAt.getTime(),
  );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12 sm:px-8">
      <Link
        className="text-sm font-medium text-primary hover:underline"
        href={`/packages/${slug}`}
      >
        ← Kembali ke jadwal
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        Konfirmasi booking
      </h1>
      <p className="mt-2 text-muted-foreground">
        Periksa package dan jadwal sebelum menahan slot.
      </p>
      {query.error && (
        <p
          className="mt-5 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          role="alert"
        >
          {errorMessages[query.error] ?? "Booking gagal. Silakan coba lagi."}
        </p>
      )}
      {!slot ? (
        <div className="mt-6 rounded-xl border border-dashed p-5">
          <p role="alert">
            Slot ini sudah tidak tersedia. Silakan pilih jadwal lain.
          </p>
          <Link
            className="mt-3 inline-block text-primary hover:underline"
            href={`/packages/${slug}`}
          >
            Pilih slot lain
          </Link>
        </div>
      ) : (
        <form
          action={createBookingAction}
          className="mt-6 space-y-5 rounded-xl border bg-card p-5 sm:p-7"
        >
          <input type="hidden" name="packageId" value={photoPackage.id} />
          <input type="hidden" name="packageSlug" value={slug} />
          <input type="hidden" name="startAt" value={slot.startAt} />
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Package</dt>
              <dd className="font-medium">{photoPackage.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Harga</dt>
              <dd className="font-medium">
                {formatRupiah(photoPackage.price)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Mulai</dt>
              <dd className="font-medium">
                {formatStudioDateTime(
                  new Date(slot.startAt),
                  env.STUDIO_TIMEZONE,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Selesai</dt>
              <dd className="font-medium">
                {formatStudioDateTime(
                  new Date(slot.endAt),
                  env.STUDIO_TIMEZONE,
                )}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Slot ditahan selama {env.BOOKING_HOLD_MINUTES} menit. Pembayaran
            QRIS akan tersedia pada langkah berikutnya.
          </p>
          <label className="block text-sm font-medium">
            Catatan (opsional)
            <textarea
              name="customerNote"
              maxLength={1000}
              rows={3}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground"
          >
            Buat booking
          </button>
        </form>
      )}
    </main>
  );
}
