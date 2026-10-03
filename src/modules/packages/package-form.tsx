"use client";

import type { Package } from "@prisma/client";
import { useState, type ChangeEvent } from "react";
import {
  requestPackageCoverUpload,
  savePackage,
} from "@/modules/packages/actions";
import Image from "next/image";
import { PHOTO_SESSION_BUFFER_MINUTES } from "@/modules/scheduling/session-duration";

type PackageFormProps = {
  packageRecord?: Pick<
    Package,
    | "id"
    | "name"
    | "slug"
    | "description"
    | "price"
    | "durationMinutes"
    | "sortOrder"
    | "coverImageUrl"
  >;
  error?: string;
};

const fieldClassName =
  "mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PackageForm({ packageRecord, error }: PackageFormProps) {
  const [uploading, setUploading] = useState(false);
  const [coverImageKey, setCoverImageKey] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState(
    packageRecord?.coverImageUrl ?? "",
  );

  async function uploadCover(event: ChangeEvent<HTMLInputElement>) {
    setCoverImageKey("");
    setUploadMessage("");
    setPreviewUrl(packageRecord?.coverImageUrl ?? "");
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    ) {
      setUploadMessage(
        "Gunakan JPG, PNG, atau WebP dengan ukuran maksimal 10 MB.",
      );
      return;
    }
    setUploading(true);
    try {
      const requested = await requestPackageCoverUpload({
        contentType: file.type,
        size: file.size,
      });
      if (!requested.ok) {
        setUploadMessage(
          requested.code === "INVALID_FILE"
            ? "File gambar tidak valid."
            : "Object storage belum siap.",
        );
        return;
      }
      const response = await fetch(requested.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        setUploadMessage("Upload gagal. Periksa koneksi dan CORS bucket.");
        return;
      }
      setCoverImageKey(requested.storageKey);
      setPreviewUrl(requested.imageUrl);
      setUploadMessage(
        "Gambar terunggah. Simpan paket untuk memakainya sebagai sampul.",
      );
    } catch {
      setUploadMessage("Object storage belum siap atau upload gagal.");
    } finally {
      setUploading(false);
    }
  }

  const labels: Record<string, string> = {
    invalid: "Data package tidak valid. Periksa kembali setiap kolom.",
    slug_taken: "Slug sudah digunakan package lain.",
    invalid_image: "Gambar sampul tidak valid. Unggah kembali file gambar.",
    storage_unavailable: "Object storage belum siap. Coba unggah lagi.",
  };

  return (
    <form action={savePackage} className="mt-8 space-y-6">
      {packageRecord && (
        <input type="hidden" name="id" value={packageRecord.id} />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
        >
          {labels[error] ?? "Package gagal disimpan. Coba lagi."}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Nama package
          <input
            className={fieldClassName}
            name="name"
            required
            maxLength={120}
            defaultValue={packageRecord?.name}
          />
        </label>
        <label className="text-sm font-medium">
          Slug
          <input
            className={fieldClassName}
            name="slug"
            required
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="portrait-basic"
            defaultValue={packageRecord?.slug}
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Dipakai sebagai alamat halaman package.
          </span>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Deskripsi
        <textarea
          className={fieldClassName}
          name="description"
          required
          maxLength={3000}
          rows={5}
          defaultValue={packageRecord?.description}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">
          Harga (rupiah)
          <input
            className={fieldClassName}
            name="price"
            type="number"
            required
            min={20000}
            max={40000}
            step={1}
            defaultValue={packageRecord?.price ?? 20000}
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Harga package Rp20.000–Rp40.000.
          </span>
        </label>
        <label className="text-sm font-medium">
          Durasi sesi (menit)
          <input
            className={fieldClassName}
            name="durationMinutes"
            type="number"
            required
            min={5}
            max={60}
            step={1}
            defaultValue={packageRecord?.durationMinutes ?? 10}
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            5–60 menit per sesi; jeda {PHOTO_SESSION_BUFFER_MINUTES} menit.
          </span>
        </label>
        <label className="text-sm font-medium">
          Urutan tampil
          <input
            className={fieldClassName}
            name="sortOrder"
            type="number"
            required
            min={0}
            step={1}
            defaultValue={packageRecord?.sortOrder ?? 0}
          />
        </label>
      </div>
      <div className="rounded-xl border border-primary/10 bg-white/70 p-4">
        <label className="block text-sm font-medium">
          Unggah foto sampul (JPG, PNG, WebP; maks. 10 MB)
          <input
            className={fieldClassName}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={uploadCover}
            disabled={uploading}
          />
        </label>
        <input type="hidden" name="coverImageKey" value={coverImageKey} />
        {previewUrl && (
          <div className="relative mt-4 h-40 w-full overflow-hidden rounded-lg sm:w-64">
            <Image
              src={previewUrl}
              alt="Pratinjau sampul paket"
              fill
              sizes="256px"
              unoptimized
              className="object-cover"
            />
          </div>
        )}
        {uploadMessage && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {uploadMessage}
          </p>
        )}
      </div>
      <label className="block text-sm font-medium">
        URL foto sampul (opsional, jika tidak mengunggah file)
        <input
          className={fieldClassName}
          name="coverImageUrl"
          type="url"
          placeholder="https://..."
          defaultValue={packageRecord?.coverImageUrl ?? ""}
        />
      </label>
      <button
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        type="submit"
        disabled={uploading}
      >
        {uploading
          ? "Mengunggah…"
          : packageRecord
            ? "Simpan perubahan"
            : "Buat package"}
      </button>
    </form>
  );
}
