"use client";

import { useState } from "react";
import { deleteGalleryImage, setGalleryPublished } from "@/modules/gallery/actions";

export function GalleryItemControls({ id, isPublished }: { id: string; isPublished: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const result = await setGalleryPublished({ id, isPublished: !isPublished });
    setBusy(false);
    setMessage(result.ok ? "Status diperbarui." : "Gagal memperbarui status.");
    if (result.ok) window.location.reload();
  }
  async function remove() {
    if (!window.confirm("Hapus gambar gallery ini?")) return;
    setBusy(true);
    const result = await deleteGalleryImage(id);
    setBusy(false);
    setMessage(result.ok ? "Gambar dihapus." : "Metadata dihapus, tetapi object storage perlu diperiksa.");
    window.location.reload();
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={busy} onClick={toggle} className="rounded-md border px-3 py-2 text-sm">
        {isPublished ? "Jadikan draft" : "Publikasikan"}
      </button>
      <button disabled={busy} onClick={remove} className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
        Hapus
      </button>
      {message && <span role="status" className="sr-only">{message}</span>}
    </div>
  );
}
