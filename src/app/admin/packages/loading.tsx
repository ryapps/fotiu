export default function AdminPackagesLoading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="h-9 w-56 animate-pulse rounded bg-secondary" />
      <p className="mt-4 text-sm text-muted-foreground">
        Memuat pengelolaan paket...
      </p>
      <div className="mt-8 h-64 animate-pulse rounded-xl bg-secondary" />
    </main>
  );
}
