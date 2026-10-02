import { z } from "zod";

export type GalleryMimeType = "image/jpeg" | "image/png" | "image/webp";
export const MAX_GALLERY_IMAGE_BYTES = 10 * 1024 * 1024;
export const galleryUploadRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(MAX_GALLERY_IMAGE_BYTES),
});

export function hasImageSignature(type: GalleryMimeType, bytes: Uint8Array) {
  if (type === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png")
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
