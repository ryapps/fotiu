import { describe, expect, it } from "vitest";
import {
  galleryUploadRequestSchema,
  hasImageSignature,
  MAX_GALLERY_IMAGE_BYTES,
} from "@/modules/gallery/image-validation";

describe("gallery upload image signature validation", () => {
  it("accepts the supported JPEG, PNG, and WebP headers", () => {
    expect(hasImageSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(hasImageSignature("image/png", Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(hasImageSignature("image/webp", new TextEncoder().encode("RIFF0000WEBP"))).toBe(true);
  });

  it("rejects mismatched and incomplete file signatures", () => {
    expect(hasImageSignature("image/jpeg", new TextEncoder().encode("hello"))).toBe(false);
    expect(hasImageSignature("image/png", Uint8Array.from([137, 80, 78]))).toBe(false);
    expect(hasImageSignature("image/webp", new TextEncoder().encode("RIFF0000JPEG"))).toBe(false);
  });

  it("accepts allowed file sizes and rejects unsupported types or oversized files", () => {
    expect(galleryUploadRequestSchema.safeParse({ contentType: "image/webp", size: MAX_GALLERY_IMAGE_BYTES }).success).toBe(true);
    expect(galleryUploadRequestSchema.safeParse({ contentType: "image/svg+xml", size: 100 }).success).toBe(false);
    expect(galleryUploadRequestSchema.safeParse({ contentType: "image/jpeg", size: MAX_GALLERY_IMAGE_BYTES + 1 }).success).toBe(false);
    expect(galleryUploadRequestSchema.safeParse({ contentType: "image/png", size: 0 }).success).toBe(false);
  });
});
