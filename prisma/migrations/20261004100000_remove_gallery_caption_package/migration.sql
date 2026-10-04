ALTER TABLE "gallery_images"
  DROP CONSTRAINT "gallery_images_packageId_fkey",
  DROP COLUMN "caption",
  DROP COLUMN "packageId";