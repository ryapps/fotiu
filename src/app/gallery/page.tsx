import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BackButton } from "./back-button"; 

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gallery | Fotiu Studio",
  description: "Lihat pilihan hasil sesi foto di Fotiu Studio.",
};

export default async function GalleryPage() {
  const images = await prisma.galleryImage.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      imageUrl: true,
    },
  });
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
      <div className="mb-6">
        <BackButton />
      </div>
      <header className="mb-8 overflow-hidden rounded-[2rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-6 shadow-[0_24px_64px_rgba(40,80,150,0.07)] sm:p-8">
        <div className="max-w-2xl space-y-3">
          <span className="feature-badge">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Fotiu Studio
          </span>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-4xl">
            Gallery inspirasi
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            Inspirasi sesi foto dari momen yang sudah terabadikan di Fotiu.
          </p>
        </div>
      </header>
      {images.length === 0 ? (
        <section className="rounded-[1.75rem] border border-dashed border-primary/15 bg-white/80 p-8 text-center shadow-[0_20px_40px_rgba(37,74,138,0.04)]">
          <h2 className="font-semibold text-foreground">
            Gallery sedang disiapkan
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Contoh hasil foto akan segera ditampilkan.
          </p>
          <Link
            href="/packages"
            className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_18px_30px_rgba(37,99,180,0.2)]"
          >
            Lihat package
          </Link>
        </section>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <li
              key={image.id}
              className="group overflow-hidden rounded-[1.5rem] border border-border/80 bg-white/80 shadow-[0_18px_35px_rgba(37,74,138,0.06)] transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="relative h-72 overflow-hidden bg-secondary">
                <Image
                  src={image.imageUrl}
                  alt="Hasil sesi foto Fotiu Studio"
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1d1413]/60 via-transparent to-transparent" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
