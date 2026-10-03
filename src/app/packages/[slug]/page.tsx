import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AvailabilityPicker } from "@/modules/scheduling/availability-picker";
import {
  PHOTO_SESSION_BUFFER_MINUTES,
  PHOTO_SESSION_DURATION_MINUTES,
} from "@/modules/scheduling/session-duration";
import { addCalendarDays, getLocalDate } from "@/modules/scheduling/time";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

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
      coverImageUrl: true,
    },
  });

  if (!photoPackage) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        href="/packages"
      >
        <span aria-hidden="true">←</span>
        Semua paket
      </Link>

      <article className="mt-6 overflow-hidden rounded-[2rem] border border-primary/10 bg-gradient-to-br from-white via-[#f7faff] to-[#eaf3ff] shadow-[0_26px_70px_rgba(40,80,150,0.08)] md:grid md:grid-cols-2">
        {photoPackage.coverImageUrl ? (
          <div className="relative min-h-64 w-full md:h-[500px]">
            <Image
              src={photoPackage.coverImageUrl}
              alt={`Foto ${photoPackage.name}`}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              unoptimized
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#271b18]/45 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center bg-gradient-to-br from-[#edf5ff] to-[#dfecff] text-sm text-muted-foreground md:h-[500px]">
            Foto paket
          </div>
        )}
        <div className="flex flex-col justify-center p-6 sm:p-9">
          <span className="feature-badge w-fit">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Sesi foto Fotiu
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-4xl">
            {photoPackage.name}
          </h1>
          <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-muted-foreground">
            {photoPackage.description}
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-4 rounded-[1.5rem] border border-primary/10 bg-white/80 p-4 shadow-[0_10px_24px_rgba(37,74,138,0.05)]">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Harga
              </dt>
              <dd className="mt-2 text-lg font-semibold text-foreground">
                {formatRupiah(photoPackage.price)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Durasi
              </dt>
              <dd className="mt-2 text-lg font-semibold text-foreground">
                {PHOTO_SESSION_DURATION_MINUTES} menit
              </dd>
            </div>
            {PHOTO_SESSION_BUFFER_MINUTES > 0 && (
              <div className="col-span-2">
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Waktu persiapan
                </dt>
                <dd className="mt-2 text-lg font-semibold text-foreground">
                  {PHOTO_SESSION_BUFFER_MINUTES} menit
                </dd>
              </div>
            )}
          </dl>
        </div>
      </article>
      <div className="mt-8">
        <AvailabilityPicker
          packageId={photoPackage.id}
          packageSlug={slug}
          timeZone={env.STUDIO_TIMEZONE}
          initialDate={today}
          maxDate={addCalendarDays(today, env.MAX_ADVANCE_DAYS)}
        />
      </div>
    </main>
  );
}
