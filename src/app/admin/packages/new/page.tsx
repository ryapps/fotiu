import { requireAdmin } from "@/modules/auth/guards";
import { PackageForm } from "@/modules/packages/package-form";
import Link from "next/link";

type NewPackagePageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewPackagePage({
  searchParams,
}: NewPackagePageProps) {
  await requireAdmin();
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
      <header className="rounded-[1.75rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-6 shadow-[0_20px_54px_rgba(40,80,150,0.07)] sm:p-8">
        <Link
          className="text-sm font-medium text-primary hover:underline"
          href="/admin/packages"
        >
          ← Kelola paket
        </Link>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Katalog studio
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Tambah paket
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Isi informasi yang akan dilihat customer.
        </p>
      </header>
      <PackageForm error={error} />
    </main>
  );
}
