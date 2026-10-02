"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import {
  PHOTO_SESSION_BUFFER_MINUTES,
  PHOTO_SESSION_DURATION_MINUTES,
} from "@/modules/scheduling/session-duration";
import {
  packageActiveActionSchema,
  packageIdSchema,
  parsePackageFormData,
} from "@/modules/packages/schema";

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
  const parsedId = rawId === null ? null : packageIdSchema.safeParse(rawId);
  if (parsedId && !parsedId.success) formError("/admin/packages/new", "invalid");
  const id = parsedId?.data ?? null;
  const formPath = packageFormPath(id ?? undefined);
  const parsed = parsePackageFormData(formData);

  if (!parsed.success) formError(formPath, "invalid");

  const { coverImageUrl, ...fields } = parsed.data;
  const data = {
    ...fields,
    durationMinutes: PHOTO_SESSION_DURATION_MINUTES,
    bufferMinutes: PHOTO_SESSION_BUFFER_MINUTES,
    coverImageUrl: coverImageUrl || null,
  };

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
  revalidatePath("/");
  revalidatePath(`/packages/${data.slug}`);
  revalidatePath("/admin/packages");
  redirect("/admin/packages?saved=1");
}

export async function setPackageActive(formData: FormData) {
  await requireAdmin();

  const parsed = packageActiveActionSchema.safeParse({
    id: formData.get("id"),
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) {
    redirect("/admin/packages?error=invalid");
  }
  const { id, isActive } = parsed.data;

  const existing = await prisma.package.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!existing) redirect("/admin/packages?error=not_found");

  await prisma.package.update({
    where: { id },
    data: { isActive },
  });
  revalidatePath("/packages");
  revalidatePath("/");
  revalidatePath(`/packages/${existing.slug}`);
  revalidatePath("/admin/packages");
  redirect("/admin/packages?saved=1");
}

export async function deletePackage(formData: FormData) {
  await requireAdmin();

  const parsedId = packageIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) {
    redirect("/admin/packages?error=invalid");
  }
  const id = parsedId.data;

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
  revalidatePath("/");
  revalidatePath(`/packages/${existing.slug}`);
  revalidatePath("/admin/packages");
  redirect("/admin/packages?saved=1");
}
