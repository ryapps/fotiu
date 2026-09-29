"use client";

export default function PackagesError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Package belum dapat dimuat</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Terjadi kendala saat mengambil katalog. Coba beberapa saat lagi.
      </p>
      <button
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        onClick={reset}
      >
        Coba lagi
      </button>
    </main>
  );
}
