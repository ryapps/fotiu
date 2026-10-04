import { prisma } from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { BackButton } from "./[slug]/back-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Paket Foto | Fotiu Studio",
  description: "Jelajahi paket sesi foto, durasi, dan harga di Fotiu Studio.",
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

async function ActivePackageGrid() {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      description: true,
      price: true,
      durationMinutes: true,
      coverImageUrl: true,
    },
  });

  return packages.length === 0 ? (
    <section
      className="rounded-[1.75rem] border border-dashed border-border/80 bg-white/80 p-8 text-center shadow-[0_20px_40px_rgba(37,74,138,0.04)]"
      aria-live="polite"
    >
      <h2 className="font-semibold text-foreground">
        Belum ada paket tersedia
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Silakan cek kembali nanti.
      </p>
    </section>
  ) : (
    <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map((photoPackage) => (
        <li key={photoPackage.slug}>
          <article className="soft-card group flex h-full flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(37,74,138,0.08)]">
            {photoPackage.coverImageUrl ? (
              <div className="relative h-56 w-full overflow-hidden">
                <Image
                  src={photoPackage.coverImageUrl}
                  alt={`Foto ${photoPackage.name}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  unoptimized
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#271b18]/50 via-transparent to-transparent" />
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center bg-gradient-to-br from-[#edf5ff] to-[#e4efff] text-sm text-muted-foreground">
                Foto paket
              </div>
            )}
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold text-foreground">
                  {photoPackage.name}
                </h2>
                <span className="rounded-full bg-primary/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
                  Best
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {photoPackage.description}
              </p>
              <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-[#eff6ff] p-3 text-sm">
                <span className="font-semibold text-foreground">
                  {formatRupiah(photoPackage.price)}
                </span>
                <span className="text-muted-foreground">
                  {photoPackage.durationMinutes} menit
                </span>
              </div>
              <Link
                className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_18px_30px_rgba(37,99,180,0.2)] transition-transform hover:-translate-y-0.5 hover:opacity-95"
                href={`/packages/${photoPackage.slug}`}
              >
                Lihat detail
              </Link>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

function PackageGridLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="mb-4 text-sm text-muted-foreground">Memuat package...</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div
            className="h-80 animate-pulse rounded-xl bg-secondary"
            key={item}
          />
        ))}
      </div>
    </div>
  );
}

export default function PackagesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
      <div className="mb-6">
        <BackButton />
      </div>
      <header className="mb-8 overflow-hidden rounded-[2rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-6 shadow-[0_24px_64px_rgba(40,80,150,0.07)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <span className="feature-badge">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Fotiu Studio
            </span>
            <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-4xl">
              Pilih sesi foto yang paling cocok
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              Lihat pilihan sesi, durasi, dan harga dengan tampilan yang lebih
              jelas sebelum memilih jadwal.
            </p>
          </div>
        </div>
      </header>
      <Suspense fallback={<PackageGridLoading />}>
        <ActivePackageGrid />
      </Suspense>
    </main>
  );
}
