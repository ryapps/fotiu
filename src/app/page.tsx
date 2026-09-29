import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-16 sm:px-8">
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-primary">Fotiu Studio</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">
          Abadikan momen, dengan sesi yang terasa personal.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          Jelajahi pilihan sesi foto studio, lihat detail dan harga, lalu
          siapkan pengalaman yang cocok untuk momen Anda.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
            href="/packages"
          >
            Lihat package
          </Link>
          <Link
            className="inline-flex h-11 items-center rounded-md border px-5 text-sm font-medium hover:bg-secondary"
            href="/login"
          >
            Masuk
          </Link>
        </div>
      </section>
    </main>
  );
}
