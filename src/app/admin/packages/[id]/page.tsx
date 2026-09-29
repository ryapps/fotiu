import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { PackageForm } from "@/modules/packages/package-form";

type EditPackagePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditPackagePage({
  params,
  searchParams,
}: EditPackagePageProps) {
  await requireAdmin();
  const { id } = await params;
  const [{ error }, packageRecord] = await Promise.all([
    searchParams,
    prisma.package.findUnique({ where: { id } }),
  ]);

  if (!packageRecord) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
      <Link
        className="text-sm text-muted-foreground hover:underline"
        href="/admin/packages"
      >
        ← Kelola package
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Edit package
      </h1>
      <p className="mb-8 mt-2 text-sm text-muted-foreground">
        Perubahan harga hanya berlaku untuk booking baru; snapshot booking lama
        tetap tersimpan.
      </p>
      <PackageForm packageRecord={packageRecord} error={error} />
    </main>
  );
}
