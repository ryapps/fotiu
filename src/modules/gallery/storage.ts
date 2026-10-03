import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import {
  hasImageSignature,
  MAX_GALLERY_IMAGE_BYTES,
  type GalleryMimeType,
} from "@/modules/gallery/image-validation";

const mimeTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type { GalleryMimeType };

let client: S3Client | undefined;
function configuration() {
  const {
    STORAGE_ENDPOINT,
    STORAGE_REGION,
    STORAGE_BUCKET,
    STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY,
    STORAGE_PUBLIC_URL,
  } = env;
  if (
    !STORAGE_ENDPOINT ||
    !STORAGE_REGION ||
    !STORAGE_BUCKET ||
    !STORAGE_ACCESS_KEY_ID ||
    !STORAGE_SECRET_ACCESS_KEY ||
    !STORAGE_PUBLIC_URL
  ) {
    throw new Error("Object storage is not configured.");
  }
  return {
    endpoint: STORAGE_ENDPOINT,
    region: STORAGE_REGION,
    bucket: STORAGE_BUCKET,
    accessKeyId: STORAGE_ACCESS_KEY_ID,
    secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
    publicUrl: STORAGE_PUBLIC_URL.replace(/\/$/, ""),
  };
}

function getClient() {
  if (client) return client;
  const config = configuration();
  client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

async function createImageUpload(
  prefix: "gallery" | "packages",
  contentType: GalleryMimeType,
) {
  const config = configuration();
  const extension = mimeTypes[contentType];
  const storageKey = `${prefix}/${randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
      ContentType: contentType,
    }),
    { expiresIn: 60 },
  );
  return {
    storageKey,
    uploadUrl,
    imageUrl: `${config.publicUrl}/${storageKey}`,
  };
}

export function createGalleryUpload(contentType: GalleryMimeType) {
  return createImageUpload("gallery", contentType);
}

export function createPackageCoverUpload(contentType: GalleryMimeType) {
  return createImageUpload("packages", contentType);
}

export function galleryPublicUrl(storageKey: string) {
  const { publicUrl } = configuration();
  return `${publicUrl}/${storageKey}`;
}

export const packageCoverPublicUrl = galleryPublicUrl;

export async function verifyGalleryObject(
  storageKey: string,
  contentType: GalleryMimeType,
) {
  const config = configuration();
  const s3 = getClient();
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: storageKey }),
  );
  if (
    !head.ContentLength ||
    head.ContentLength > MAX_GALLERY_IMAGE_BYTES ||
    head.ContentType !== contentType
  ) {
    await s3.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }),
    );
    return false;
  }
  const object = await s3.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
      Range: "bytes=0-11",
    }),
  );
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes || !hasImageSignature(contentType, bytes)) {
    await s3.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }),
    );
    return false;
  }
  return true;
}

export const verifyPackageCoverObject = verifyGalleryObject;

export async function deleteGalleryObject(storageKey: string) {
  const config = configuration();
  await getClient().send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }),
  );
}
