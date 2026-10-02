import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, createGalleryUpload } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createGalleryUpload: vi.fn(),
}));

vi.mock("@/modules/auth/guards", () => ({ requireAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/gallery/storage", () => ({
  createGalleryUpload,
  deleteGalleryObject: vi.fn(),
  galleryPublicUrl: vi.fn(),
  verifyGalleryObject: vi.fn(),
}));

import { requestGalleryUpload } from "@/modules/gallery/actions";

describe("gallery upload authorization and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ adminId: "admin-id" });
    createGalleryUpload.mockImplementation(async (contentType: string) => ({
      storageKey: `gallery/00000000-0000-4000-8000-000000000000.${contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1]}`,
      uploadUrl: "https://storage.example/upload",
    }));
  });

  it("rejects unauthorized callers before creating an upload URL", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(
      requestGalleryUpload({ contentType: "image/png", size: 1024 }),
    ).rejects.toThrow("Unauthorized");
    expect(createGalleryUpload).not.toHaveBeenCalled();
  });

  it.each([
    { contentType: "image/gif", size: 1024 },
    { contentType: "image/png", size: 0 },
    { contentType: "image/jpeg", size: 10 * 1024 * 1024 + 1 },
  ])("rejects invalid file metadata before presigning: %o", async (input) => {
    await expect(requestGalleryUpload(input)).resolves.toEqual({
      ok: false,
      code: "INVALID_FILE",
    });
    expect(createGalleryUpload).not.toHaveBeenCalled();
  });

  it("creates a presigned upload only for an authorized valid request", async () => {
    await expect(
      requestGalleryUpload({ contentType: "image/webp", size: 2048 }),
    ).resolves.toMatchObject({
      ok: true,
      storageKey: "gallery/00000000-0000-4000-8000-000000000000.webp",
      uploadUrl: "https://storage.example/upload",
    });
    expect(createGalleryUpload).toHaveBeenCalledWith("image/webp");
  });
});
