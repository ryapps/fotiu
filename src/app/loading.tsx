export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8" aria-busy="true">
      <p className="text-sm text-muted-foreground">Memuat halaman…</p>
      <div className="mt-5 h-56 animate-pulse rounded-xl bg-secondary" />
    </main>
  );
}
