"use client";

import {
  requestGalleryUpload,
  saveGalleryImage,
} from "@/modules/gallery/actions";
import { ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";

export function GalleryUploadForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "info">(
    "info",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectFile(file?: File) {
    if (!file) return;
    if (
      !(["image/jpeg", "image/png", "image/webp"] as string[]).includes(
        file.type,
      )
    ) {
      setSelectedFile(null);
      setPreviewUrl("");
      setMessageType("error");
      setMessage("Gunakan gambar JPG, PNG, atau WebP.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setSelectedFile(null);
      setPreviewUrl("");
      setMessageType("error");
      setMessage("Ukuran gambar maksimal 10 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMessage("");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) selectFile(event.dataTransfer.files[0]);
  }

  function clearFile() {
    setSelectedFile(null);
    setPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    const file = selectedFile;
    if (!file) {
      setMessageType("error");
      return setMessage("Pilih gambar yang akan diunggah.");
    }
    setMessageType("info");
    setMessage("Mengunggah gambar...");
    setBusy(true);
    try {
      const requested = await requestGalleryUpload({
        contentType: file.type,
        size: file.size,
      });
      if (!requested.ok)
        return (
          setMessageType("error"),
          setMessage(
            requested.code === "INVALID_FILE"
              ? "Format atau ukuran file tidak valid (maksimal 10 MB)."
              : "Object storage belum siap.",
          )
        );
      const uploaded = await fetch(requested.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploaded.ok)
        return (
          setMessageType("error"),
          setMessage(
            "Upload gagal. Periksa koneksi dan konfigurasi CORS bucket.",
          )
        );
      const saved = await saveGalleryImage({
        storageKey: requested.storageKey,
        contentType: file.type,
      });
      if (!saved.ok)
        return (
          setMessageType("error"),
          setMessage(
            saved.code === "INVALID_FILE"
              ? "Isi file tidak cocok dengan format gambar."
              : "Gambar terunggah, tetapi metadata belum dapat disimpan.",
          )
        );
      form.reset();
      setSelectedFile(null);
      setPreviewUrl("");
      setMessageType("success");
      setMessage(
        "Gambar tersimpan sebagai draft. Publikasikan setelah diperiksa.",
      );
      window.location.reload();
    } catch {
      setMessageType("error");
      setMessage("Object storage belum siap atau upload gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 overflow-hidden rounded-2xl border border-primary/10 bg-white/90 shadow-[0_16px_40px_rgba(37,74,138,0.06)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-semibold">Tambah gambar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Unggah ke gallery sebagai draft.
          </p>
        </div>
        <span className="rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          JPG, PNG, WebP · maks. 10 MB
        </span>
      </div>

      <div className="grid gap-5 p-5 sm:p-6">
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setDragging(false);
            }
          }}
          onDrop={handleDrop}
          className={`relative overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-primary/20 bg-[#f7faff] hover:border-primary/40"
          }`}
        >
          <input
            ref={fileInputRef}
            id="gallery-image-file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Pilih gambar untuk gallery"
            aria-describedby="gallery-file-help gallery-upload-feedback"
            disabled={busy}
            className="sr-only"
            onChange={(event) => selectFile(event.currentTarget.files?.[0])}
          />
          {selectedFile && previewUrl ? (
            <div className="grid sm:grid-cols-[180px_1fr]">
              <div className="relative aspect-[4/3] bg-secondary sm:aspect-auto sm:min-h-40">
                <Image
                  src={previewUrl}
                  alt={`Pratinjau ${selectedFile.name}`}
                  fill
                  unoptimized
                  sizes="180px"
                  className="object-cover"
                />
              </div>
              <div className="flex min-w-0 items-center justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {selectedFile.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Siap
                    diunggah
                  </p>
                  <label
                    htmlFor="gallery-image-file"
                    className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <Upload aria-hidden="true" className="h-4 w-4" />
                    Ganti gambar
                  </label>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  disabled={busy}
                  aria-label="Hapus gambar terpilih"
                  title="Hapus gambar"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="gallery-image-file"
              className="flex min-h-48 cursor-pointer flex-col items-center justify-center px-5 py-8 text-center sm:min-h-56"
            >
              <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white text-primary shadow-sm ring-1 ring-primary/10">
                <ImagePlus aria-hidden="true" className="h-6 w-6" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                {dragging
                  ? "Lepaskan gambar untuk memilih"
                  : "Seret gambar ke sini"}
              </span>
              <span className="mt-1 text-sm text-muted-foreground">
                atau pilih file dari perangkat
              </span>
              <span className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-sm font-medium text-primary shadow-sm">
                <Upload aria-hidden="true" className="h-4 w-4" />
                Pilih gambar
              </span>
            </label>
          )}
        </div>

        <p
          id="gallery-file-help"
          className="-mt-3 text-xs text-muted-foreground"
        >
          Pilih satu gambar dalam format JPG, PNG, atau WebP. Ukuran maksimum 10
          MB.
        </p>

        <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p
            id="gallery-upload-feedback"
            role={messageType === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`min-h-5 text-sm ${
              messageType === "error"
                ? "text-destructive"
                : messageType === "success"
                  ? "text-primary"
                  : "text-muted-foreground"
            }`}
          >
            {message}
          </p>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy ? (
              <LoaderCircle
                aria-hidden="true"
                className="h-4 w-4 animate-spin"
              />
            ) : (
              <Upload aria-hidden="true" className="h-4 w-4" />
            )}
            {busy ? "Mengunggah..." : "Upload sebagai draft"}
          </button>
        </div>
      </div>
    </form>
  );
}
