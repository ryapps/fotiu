import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { deletePackage, setPackageActive } from "@/modules/packages/actions";
import Link from "next/link";

type AdminPackagesPageProps = {
  searchParams: Promise<{ error?: string; saved?: string }>;
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function AdminPackagesPage({
  searchParams,
}: AdminPackagesPageProps) {
  await requireAdmin();
  const [{ error, saved }, packages] = await Promise.all([
    searchParams,
    prisma.package.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { bookings: true } } },
    }),
  ]);

  const errorMessages: Record<string, string> = {
    invalid: "Permintaan tidak valid.",
    not_found: "Paket tidak ditemukan atau sudah dihapus.",
    has_bookings:
      "Paket memiliki riwayat booking dan tidak dapat dihapus. Nonaktifkan paket untuk menyembunyikannya.",
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-[1.75rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-6 shadow-[0_20px_54px_rgba(40,80,150,0.07)] sm:p-8">
        <div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Katalog studio
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Kelola paket
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Atur katalog paket yang ditampilkan customer.
          </p>
        </div>
        <Link
          className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:opacity-90"
          href="/admin/packages/new"
        >
          Tambah paket
        </Link>
      </header>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
        >
          {errorMessages[error] ?? "Terjadi kesalahan. Silakan coba kembali."}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="mt-6 rounded-md border border-primary/30 p-3 text-sm"
        >
          Perubahan paket berhasil disimpan.
        </p>
      )}

      {packages.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-primary/20 bg-white/60 p-8 text-center">
          <h2 className="font-semibold">Belum ada paket</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Buat paket pertama untuk mulai mengisi katalog.
          </p>
        </section>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-primary/10 bg-white/85 shadow-[0_12px_28px_rgba(37,74,138,0.04)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-secondary/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Paket</th>
                <th className="px-4 py-3 font-medium">Harga / durasi</th>
                <th className="px-4 py-3 font-medium">Booking</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {packages.map((photoPackage) => (
                <tr
                  key={photoPackage.id}
                  className="transition-colors hover:bg-primary/[0.025]"
                >
                  <td className="px-4 py-4">
                    <div className="font-medium">{photoPackage.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      /{photoPackage.slug}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {formatRupiah(photoPackage.price)}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {photoPackage.durationMinutes} menit · jeda{" "}
                      {photoPackage.bufferMinutes} menit
                    </div>
                  </td>
                  <td className="px-4 py-4">{photoPackage._count.bookings}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${photoPackage.isActive ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                    >
                      {photoPackage.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="rounded-full border border-primary/15 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary/5"
                        href={`/admin/packages/${photoPackage.id}`}
                      >
                        Edit
                      </Link>
                      <form action={setPackageActive}>
                        <input
                          type="hidden"
                          name="id"
                          value={photoPackage.id}
                        />
                        <input
                          type="hidden"
                          name="isActive"
                          value={String(!photoPackage.isActive)}
                        />
                        <button
                          className="rounded-full border border-primary/15 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary/5"
                          type="submit"
                        >
                          {photoPackage.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </form>
                      {photoPackage._count.bookings === 0 ? (
                        <form action={deletePackage}>
                          <input
                            type="hidden"
                            name="id"
                            value={photoPackage.id}
                          />
                          <button
                            className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                            type="submit"
                          >
                            Hapus
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Tidak dapat dihapus: punya riwayat
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
