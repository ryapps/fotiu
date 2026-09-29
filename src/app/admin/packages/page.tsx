import Link from "next/link";
import { requireAdmin } from "@/modules/auth/guards";
import { deletePackage, setPackageActive } from "@/modules/packages/actions";
import { prisma } from "@/lib/prisma";

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
    not_found: "Package tidak ditemukan atau sudah dihapus.",
    has_bookings:
      "Package memiliki riwayat booking dan tidak dapat dihapus. Nonaktifkan package untuk menyembunyikannya.",
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            className="text-sm text-muted-foreground hover:underline"
            href="/admin"
          >
            ← Dashboard admin
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Kelola package
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Atur katalog package yang ditampilkan customer.
          </p>
        </div>
        <Link
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          href="/admin/packages/new"
        >
          Tambah package
        </Link>
      </div>

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
          Perubahan package berhasil disimpan.
        </p>
      )}

      {packages.length === 0 ? (
        <section className="mt-8 rounded-xl border border-dashed p-8 text-center">
          <h2 className="font-semibold">Belum ada package</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Buat package pertama untuk mulai mengisi katalog.
          </p>
        </section>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-secondary/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Harga / durasi</th>
                <th className="px-4 py-3 font-medium">Booking</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {packages.map((photoPackage) => (
                <tr key={photoPackage.id}>
                  <td className="px-4 py-4">
                    <div className="font-medium">{photoPackage.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      /{photoPackage.slug}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {formatRupiah(photoPackage.price)}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {photoPackage.durationMinutes} menit
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
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
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
                          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
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
