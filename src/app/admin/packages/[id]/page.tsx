import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { PackageForm } from "@/modules/packages/package-form";
import Link from "next/link";
import { notFound } from "next/navigation";

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
    prisma.package.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        durationMinutes: true,
        sortOrder: true,
        coverImageUrl: true,
      },
    }),
  ]);

  if (!packageRecord) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
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
          Edit paket
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Perubahan harga dan durasi berlaku untuk booking baru. Harga dan
          jadwal booking lama tetap tersimpan.
        </p>
      </header>
      <PackageForm packageRecord={packageRecord} error={error} />
    </main>
  );
}
