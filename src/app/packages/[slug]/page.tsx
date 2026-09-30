import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AvailabilityPicker } from "@/modules/scheduling/availability-picker";
import { addCalendarDays, getLocalDate } from "@/modules/scheduling/time";

type PackagePageProps = { params: Promise<{ slug: string }> };

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function generateMetadata({
  params,
}: PackagePageProps): Promise<Metadata> {
  const { slug } = await params;
  const photoPackage = await prisma.package.findFirst({
    where: { slug, isActive: true },
    select: { name: true, description: true },
  });

  return photoPackage
    ? {
        title: `${photoPackage.name} | Fotiu`,
        description: photoPackage.description,
      }
    : { title: "Package tidak ditemukan | Fotiu" };
}

export default async function PackageDetailPage({ params }: PackagePageProps) {
  const { slug } = await params;
  const today = getLocalDate(new Date(), env.STUDIO_TIMEZONE);
  const photoPackage = await prisma.package.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      durationMinutes: true,
      bufferMinutes: true,
      coverImageUrl: true,
    },
  });

  if (!photoPackage) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8">
      <Link
        className="text-sm font-medium text-primary hover:underline"
        href="/packages"
      >
        ← Semua package
      </Link>
      <article className="mt-6 grid overflow-hidden rounded-2xl border bg-card md:grid-cols-2">
        {photoPackage.coverImageUrl ? (
          <div className="relative min-h-64 w-full md:h-[480px]">
            <Image
              src={photoPackage.coverImageUrl}
              alt={`Foto ${photoPackage.name}`}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center bg-secondary text-sm text-muted-foreground">
            Foto package
          </div>
        )}
        <div className="flex flex-col justify-center p-6 sm:p-9">
          <p className="text-sm font-medium text-primary">Sesi foto Fotiu</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {photoPackage.name}
          </h1>
          <p className="mt-4 whitespace-pre-wrap leading-7 text-muted-foreground">
            {photoPackage.description}
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-4 rounded-lg bg-secondary/60 p-4">
            <div>
              <dt className="text-xs text-muted-foreground">Harga</dt>
              <dd className="mt-1 font-semibold">
                {formatRupiah(photoPackage.price)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Durasi sesi</dt>
              <dd className="mt-1 font-semibold">
                {photoPackage.durationMinutes} menit
              </dd>
            </div>
            {photoPackage.bufferMinutes > 0 && (
              <div>
                <dt className="text-xs text-muted-foreground">
                  Waktu persiapan
                </dt>
                <dd className="mt-1 font-semibold">
                  {photoPackage.bufferMinutes} menit
                </dd>
              </div>
            )}
          </dl>
        </div>
      </article>
      <AvailabilityPicker
        packageId={photoPackage.id}
        packageSlug={slug}
        timeZone={env.STUDIO_TIMEZONE}
        initialDate={today}
        maxDate={addCalendarDays(today, env.MAX_ADVANCE_DAYS)}
      />
    </main>
  );
}
