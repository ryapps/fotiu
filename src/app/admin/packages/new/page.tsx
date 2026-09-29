import Link from "next/link";
import { requireAdmin } from "@/modules/auth/guards";
import { PackageForm } from "@/modules/packages/package-form";

type NewPackagePageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewPackagePage({
  searchParams,
}: NewPackagePageProps) {
  await requireAdmin();
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
      <Link
        className="text-sm text-muted-foreground hover:underline"
        href="/admin/packages"
      >
        ← Kelola package
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Tambah package
      </h1>
      <p className="mb-8 mt-2 text-sm text-muted-foreground">
        Isi informasi yang akan dilihat customer.
      </p>
      <PackageForm error={error} />
    </main>
  );
}
