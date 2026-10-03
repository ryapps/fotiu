import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { ArrowRight, Sparkles, Target, Zap } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fotiu Studio | Sesi Foto Personal",
  description:
    "Jelajahi paket foto, pilih jadwal, dan booking sesi di Fotiu Studio.",
};

const rupiah = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const weekdayNames = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const heroPortrait = "/images/hero-portrait.jpg";

export default async function Home() {
  const [packages, gallery, operatingHours] = await Promise.all([
    prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 3,
      select: {
        slug: true,
        name: true,
        description: true,
        price: true,
        coverImageUrl: true,
      },
    }),
    prisma.galleryImage.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 3,
      select: { id: true, imageUrl: true, caption: true },
    }),
    prisma.operatingHour.findMany({
      orderBy: { weekday: "asc" },
      select: { weekday: true, isOpen: true, openTime: true, closeTime: true },
    }),
  ]);

  return (
    <main className="flex-1">
      <section className="relative overflow-hidden py-8 sm:py-12">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(104,165,255,0.2),_transparent_60%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-16">
          <div>
            <span className="feature-badge">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Fotiu Studio
            </span>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-[-0.06em] text-foreground sm:text-5xl lg:text-6xl">
              Abadikan momen dengan{" "}
              <span className="text-primary">sesi foto</span> yang terasa
              personal.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Pilih paket yang cocok, cek jadwal real-time, dan booking sesi
              foto dengan proses yang cepat, jelas, dan santai.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="inline-flex h-12 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_18px_30px_rgba(37,99,180,0.2)] transition-transform hover:-translate-y-0.5 hover:opacity-95"
                href="/packages"
              >
                Lihat paket
              </Link>
              <Link
                className="inline-flex h-12 items-center rounded-full border border-border bg-white/80 px-6 text-sm font-medium text-foreground hover:bg-secondary"
                href="/gallery"
              >
                Lihat gallery
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="hero-shell p-3 sm:p-4">
              {heroPortrait || gallery[0] ? (
                <div className="relative h-[420px] overflow-hidden rounded-[1.5rem] sm:h-[500px]">
                  <Image
                    src={heroPortrait || gallery[0]?.imageUrl || ""}
                    alt="Portrait model dengan pencahayaan lembut di studio foto"
                    fill
                    priority
                    unoptimized
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#2a1b1a]/70 via-[#2a1b1a]/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
                    <div className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                      Sesi favorit
                    </div>
                    <p className="text-2xl font-semibold">
                      Personal &amp; Family
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-[420px] items-center justify-center rounded-[1.5rem] border border-dashed bg-secondary text-sm text-muted-foreground sm:h-[500px]">
                  Foto gallery segera hadir
                </div>
              )}
            </div>

            <div className="floating-badge left-[-0.5rem] top-6 sm:left-[-1rem]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Ready
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                07:00–20:00
              </p>
            </div>

            <div className="floating-badge bottom-4 right-[-0.5rem] sm:right-[-1rem]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Rating
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                4.9/5
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Mulai dari sini
            </p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Pilihan sesi foto
            </h2>
          </div>
          <Link
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            href="/packages"
          >
            Semua paket
          </Link>
        </div>

        {packages.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border bg-white/70 p-6 text-sm text-muted-foreground">
            Pilihan sesi sedang disiapkan. Silakan kunjungi kembali nanti.
          </p>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {packages.map(
              (item: {
                slug: string;
                name: string;
                description: string;
                price: number;
                coverImageUrl: string | null;
              }) => (
                <li
                  key={item.slug}
                  className="soft-card overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(69,46,40,0.08)]"
                >
                  {item.coverImageUrl ? (
                    <div className="relative h-52 overflow-hidden">
                      <Image
                        src={item.coverImageUrl}
                        alt={`Foto ${item.name}`}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 hover:scale-[1.03]"
                      />
                    </div>
                  ) : (
                    <div className="flex h-52 items-center justify-center bg-gradient-to-br from-[#edf5ff] to-[#e4efff] text-sm text-muted-foreground">
                      Foto paket
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">{item.name}</h3>
                      <span className="rounded-full bg-primary/5 px-2 py-1 text-xs font-medium text-primary">
                        Popular
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                    <p className="mt-4 text-xl font-semibold text-foreground">
                      {rupiah(item.price)}
                    </p>
                    <Link
                      className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                      href={`/packages/${item.slug}`}
                    >
                      Lihat detail dan jadwal
                    </Link>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {gallery.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-5 pb-14 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                Inspirasi
              </p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
                Momen dari Fotiu
              </h2>
            </div>
            <Link
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              href="/gallery"
            >
              Semua gallery
            </Link>
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {gallery.map(
              (item: {
                id: string;
                imageUrl: string;
                caption: string | null;
              }) => (
                <li
                  key={item.id}
                  className="group relative h-64 overflow-hidden rounded-[1.5rem] bg-[#eaf2ff] shadow-[0_18px_35px_rgba(37,74,138,0.07)] sm:h-72"
                >
                  <Image
                    src={item.imageUrl}
                    alt={item.caption || "Hasil sesi foto di Fotiu Studio"}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#221816]/65 via-transparent to-transparent" />
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      <section className="border-y border-border/80 bg-gradient-to-r from-[#f0f7ff] via-white to-[#eaf3ff]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Kenapa Fotiu
            </p>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
              Didesain agar proses booking terasa ringan, jelas, dan
              menyenangkan.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="soft-card p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Cepat</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Pilih paket, pilih jadwal, dan bayar dengan alur yang ringkas.
              </p>
            </div>
            <div className="soft-card p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#e3efff] text-[#285aa1]">
                <Target className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Jelas</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Setiap slot dan ketersediaan ditunjukkan dengan informasi yang
                mudah dibaca.
              </p>
            </div>
            <div className="soft-card p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#e4f0ff] text-[#315d93]">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Personal</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Tampilan yang tenang membuat pengalaman booking terasa premium.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Proses booking
            </p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Mudah dalam 3 langkah
            </h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Pilih paket",
              desc: "Pilih sesi yang paling cocok untuk kebutuhan momenmu.",
              tone: "from-[#eaf3ff] to-[#f8fbff]",
            },
            {
              step: "02",
              title: "Atur jadwal",
              desc: "Cek slot yang tersedia dan pilih waktu yang paling nyaman.",
              tone: "from-[#e3efff] to-[#f5f9ff]",
            },
            {
              step: "03",
              title: "Bayar & konfirmasi",
              desc: "Lakukan pembayaran dan tunggu konfirmasi booking otomatis.",
              tone: "from-[#e8f1ff] to-[#f7faff]",
            },
          ].map((item) => (
            <div
              key={item.step}
              className={`rounded-[1.75rem] border border-border/80 bg-gradient-to-br ${item.tone} p-5 shadow-[0_18px_38px_rgba(37,74,138,0.05)]`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {item.step}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-foreground">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-8 rounded-[2rem] border border-border/80 bg-white/70 p-6 shadow-[0_20px_40px_rgba(37,74,138,0.05)] backdrop-blur-sm md:grid-cols-2 md:p-8">
          <div>
            <h2 className="text-xl font-semibold sm:text-2xl">Fotiu Studio</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Studio foto untuk mengabadikan momen personal dan keluarga dengan
              gaya yang lebih santai, modern, dan mudah dijelajahi.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Info studio</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-medium">Alamat</dt>
                <dd className="text-muted-foreground">
                  {env.STUDIO_ADDRESS ?? "Belum tersedia"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Kontak</dt>
                <dd className="text-muted-foreground">
                  {env.STUDIO_CONTACT ?? "Belum tersedia"}
                </dd>
              </div>
            </dl>

            <h3 className="mt-5 text-sm font-semibold">Jam operasional</h3>
            {operatingHours.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {operatingHours.map(
                  (hours: {
                    weekday: number;
                    isOpen: boolean;
                    openTime: string;
                    closeTime: string;
                  }) => (
                    <li key={hours.weekday}>
                      {weekdayNames[hours.weekday] ?? `Hari ${hours.weekday}`}:{" "}
                      {hours.isOpen
                        ? `${hours.openTime}–${hours.closeTime} ${env.STUDIO_TIMEZONE}`
                        : "Tutup"}
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Jam operasional belum diatur.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
