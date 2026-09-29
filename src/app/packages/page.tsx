import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";

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
      className="rounded-xl border border-dashed p-8 text-center"
      aria-live="polite"
    >
      <h2 className="font-semibold">Belum ada package tersedia</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Silakan cek kembali nanti.
      </p>
    </section>
  ) : (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map((photoPackage) => (
        <li key={photoPackage.slug}>
          <article className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
            {photoPackage.coverImageUrl ? (
              <div className="relative h-52 w-full">
                <Image
                  src={photoPackage.coverImageUrl}
                  alt={`Foto ${photoPackage.name}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-52 items-center justify-center bg-secondary text-sm text-muted-foreground">
                Foto package
              </div>
            )}
            <div className="flex flex-1 flex-col p-5">
              <h2 className="text-xl font-semibold">{photoPackage.name}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {photoPackage.description}
              </p>
              <div className="mt-5 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold">
                  {formatRupiah(photoPackage.price)}
                </span>
                <span className="text-muted-foreground">
                  {photoPackage.durationMinutes} menit
                </span>
              </div>
              <Link
                className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
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
      <header className="mb-8 max-w-2xl space-y-2">
        <p className="text-sm font-medium text-primary">Fotiu Studio</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pilih sesi foto Anda
        </h1>
        <p className="text-muted-foreground">
          Lihat pilihan sesi, durasi, dan harga sebelum memilih jadwal.
        </p>
      </header>
      <Suspense fallback={<PackageGridLoading />}>
        <ActivePackageGrid />
      </Suspense>
    </main>
  );
}
