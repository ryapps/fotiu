"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-20 text-center">
      <h1 className="text-2xl font-semibold">Halaman mengalami kendala</h1>
      <p className="mt-3 text-muted-foreground">Coba muat ulang halaman. Jika masalah berlanjut, hubungi admin studio.</p>
      <button onClick={reset} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Coba lagi</button>
    </main>
  );
}
