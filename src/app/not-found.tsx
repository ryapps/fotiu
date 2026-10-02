import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-20 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="mt-3 text-muted-foreground">Tautan mungkin sudah berubah atau halaman tidak tersedia.</p>
      <Link href="/" className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Kembali ke beranda</Link>
    </main>
  );
}
