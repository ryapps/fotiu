"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { galleryUploadRequestSchema } from "@/modules/gallery/image-validation";
import {
  createGalleryUpload,
  deleteGalleryObject,
  galleryPublicUrl,
  verifyGalleryObject,
  type GalleryMimeType,
} from "@/modules/gallery/storage";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const mimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
const storageKeySchema = z
  .string()
  .regex(
    /^gallery\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/,
  );

export async function requestGalleryUpload(input: unknown) {
  await requireAdmin();
  const parsed = galleryUploadRequestSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, code: "INVALID_FILE" as const };
  try {
    return {
      ok: true as const,
      ...(await createGalleryUpload(parsed.data.contentType)),
    };
  } catch {
    return { ok: false as const, code: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function saveGalleryImage(input: unknown) {
  await requireAdmin();
  const parsed = z
    .object({
      storageKey: storageKeySchema,
      contentType: mimeSchema,
      sortOrder: z.number().int().min(0).max(10_000).default(0),
    })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false as const, code: "INVALID_INPUT" as const };
  const { storageKey, contentType, sortOrder } = parsed.data;
  if (
    !storageKey.endsWith(
      `.${contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp"}`,
    )
  )
    return { ok: false as const, code: "INVALID_FILE" as const };
  try {
    if (!(await verifyGalleryObject(storageKey, contentType)))
      return { ok: false as const, code: "INVALID_FILE" as const };
    const image = await prisma.galleryImage.create({
      data: {
        imageUrl: galleryPublicUrl(storageKey),
        storageKey,
        sortOrder,
        isPublished: false,
      },
      select: { id: true },
    });
    revalidatePath("/gallery");
    revalidatePath("/admin/gallery");
    revalidatePath("/");
    return { ok: true as const, imageId: image.id };
  } catch {
    try {
      await deleteGalleryObject(storageKey);
    } catch {
      /* Object cleanup is best effort. */
    }
    return { ok: false as const, code: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function setGalleryPublished(input: unknown) {
  await requireAdmin();
  const parsed = z
    .object({ id: z.string().cuid(), isPublished: z.boolean() })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false as const, code: "INVALID_INPUT" as const };
  const updated = await prisma.galleryImage.updateMany({
    where: { id: parsed.data.id },
    data: { isPublished: parsed.data.isPublished },
  });
  if (!updated.count) return { ok: false as const, code: "NOT_FOUND" as const };
  revalidatePath("/gallery");
  revalidatePath("/admin/gallery");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteGalleryImage(input: unknown) {
  await requireAdmin();
  const parsed = z.string().cuid().safeParse(input);
  if (!parsed.success)
    return { ok: false as const, code: "INVALID_INPUT" as const };
  const image = await prisma.galleryImage.findUnique({
    where: { id: parsed.data },
    select: { id: true, storageKey: true },
  });
  if (!image) return { ok: false as const, code: "NOT_FOUND" as const };
  await prisma.galleryImage.delete({ where: { id: image.id } });
  try {
    await deleteGalleryObject(image.storageKey);
  } catch {
    return { ok: false as const, code: "OBJECT_DELETE_FAILED" as const };
  }
  revalidatePath("/gallery");
  revalidatePath("/admin/gallery");
  revalidatePath("/");
  return { ok: true as const };
}

export type GalleryUploadType = GalleryMimeType;
