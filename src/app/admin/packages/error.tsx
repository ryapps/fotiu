"use client";

export default function AdminPackagesError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Pengelolaan paket gagal dimuat
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Data tidak dapat diambil saat ini. Perubahan yang belum tersimpan tidak
        akan hilang dari database.
      </p>
      <button
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        onClick={reset}
      >
        Muat ulang
      </button>
    </main>
  );
}
