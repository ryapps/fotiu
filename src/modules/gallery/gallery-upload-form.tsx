"use client";

import {
  requestGalleryUpload,
  saveGalleryImage,
} from "@/modules/gallery/actions";
import { useState, type FormEvent } from "react";

type PackageOption = { id: string; name: string };

export function GalleryUploadForm({ packages }: { packages: PackageOption[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File))
      return setMessage("Pilih gambar yang akan diunggah.");
    if (
      !(["image/jpeg", "image/png", "image/webp"] as string[]).includes(
        file.type,
      )
    )
      return setMessage("Gunakan gambar JPG, PNG, atau WebP.");
    setBusy(true);
    try {
      const requested = await requestGalleryUpload({
        contentType: file.type,
        size: file.size,
      });
      if (!requested.ok)
        return setMessage(
          requested.code === "INVALID_FILE"
            ? "Format atau ukuran file tidak valid (maksimal 10 MB)."
            : "Object storage belum siap.",
        );
      const uploaded = await fetch(requested.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploaded.ok)
        return setMessage(
          "Upload gagal. Periksa koneksi dan konfigurasi CORS bucket.",
        );
      const saved = await saveGalleryImage({
        storageKey: requested.storageKey,
        contentType: file.type,
        caption: String(data.get("caption") ?? ""),
        packageId: String(data.get("packageId") ?? "") || null,
      });
      if (!saved.ok)
        return setMessage(
          saved.code === "INVALID_FILE"
            ? "Isi file tidak cocok dengan format gambar."
            : "Gambar terunggah, tetapi metadata belum dapat disimpan.",
        );
      form.reset();
      setMessage(
        "Gambar tersimpan sebagai draft. Publikasikan setelah diperiksa.",
      );
      window.location.reload();
    } catch {
      setMessage("Object storage belum siap atau upload gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)] sm:grid-cols-2"
    >
      <label className="grid gap-2 text-sm font-medium">
        Gambar (JPG, PNG, WebP; maks. 10 MB)
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="rounded-md border p-2"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Caption
        <input
          name="caption"
          maxLength={240}
          className="rounded-md border px-3 py-2"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Package (opsional)
        <select
          name="packageId"
          defaultValue=""
          className="rounded-md border px-3 py-2"
        >
          <option value="">Tanpa package</option>
          {packages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <button
          disabled={busy}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Mengunggah…" : "Upload sebagai draft"}
        </button>
      </div>
      {message && (
        <p
          role="status"
          className="text-sm text-muted-foreground sm:col-span-2"
        >
          {message}
        </p>
      )}
    </form>
  );
}
