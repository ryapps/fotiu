"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { parsePackageFormData } from "@/modules/packages/schema";

function packageFormPath(id?: string) {
  return id
    ? `/admin/packages/${encodeURIComponent(id)}`
    : "/admin/packages/new";
}

function formError(path: string, code: string): never {
  redirect(`${path}?error=${code}`);
}

export async function savePackage(formData: FormData) {
  await requireAdmin();

  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId.length > 0 ? rawId : null;
  const formPath = packageFormPath(id ?? undefined);
  const parsed = parsePackageFormData(formData);

  if (!parsed.success) formError(formPath, "invalid");

  const { coverImageUrl, ...fields } = parsed.data;
  const data = { ...fields, coverImageUrl: coverImageUrl || null };

  try {
    if (id) {
      await prisma.package.update({ where: { id }, data });
    } else {
      await prisma.package.create({ data });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      formError(formPath, "slug_taken");
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      redirect("/admin/packages?error=not_found");
    }
    throw error;
  }

  revalidatePath("/packages");
  revalidatePath(`/packages/${data.slug}`);
  revalidatePath("/admin/packages");
  redirect("/admin/packages?saved=1");
}

export async function setPackageActive(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  const activeValue = formData.get("isActive");
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    (activeValue !== "true" && activeValue !== "false")
  ) {
    redirect("/admin/packages?error=invalid");
  }

  const existing = await prisma.package.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!existing) redirect("/admin/packages?error=not_found");

  await prisma.package.update({
    where: { id },
    data: { isActive: activeValue === "true" },
  });
  revalidatePath("/packages");
  revalidatePath(`/packages/${existing.slug}`);
  revalidatePath("/admin/packages");
  redirect("/admin/packages?saved=1");
}

export async function deletePackage(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    redirect("/admin/packages?error=invalid");
  }

  const existing = await prisma.package.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!existing) redirect("/admin/packages?error=not_found");

  const bookingCount = await prisma.booking.count({ where: { packageId: id } });
  if (bookingCount > 0) redirect("/admin/packages?error=has_bookings");

  try {
    await prisma.package.delete({ where: { id } });
  } catch (error) {
    // A concurrent booking may be inserted after the count. PostgreSQL's
    // ON DELETE RESTRICT foreign key remains the final integrity guard.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      redirect("/admin/packages?error=has_bookings");
    }
    throw error;
  }

  revalidatePath("/packages");
  revalidatePath(`/packages/${existing.slug}`);
  revalidatePath("/admin/packages");
  redirect("/admin/packages?saved=1");
}
