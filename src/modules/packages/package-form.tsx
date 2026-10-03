import type { Package } from "@prisma/client";
import { savePackage } from "@/modules/packages/actions";
import {
  PHOTO_SESSION_BUFFER_MINUTES,
  PHOTO_SESSION_DURATION_MINUTES,
} from "@/modules/scheduling/session-duration";

type PackageFormProps = {
  packageRecord?: Package;
  error?: string;
};

const fieldClassName =
  "mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PackageForm({ packageRecord, error }: PackageFormProps) {
  const labels: Record<string, string> = {
    invalid: "Data package tidak valid. Periksa kembali setiap kolom.",
    slug_taken: "Slug sudah digunakan package lain.",
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
        <p className="text-sm font-medium text-muted-foreground sm:col-span-2">
          Durasi sesi ditetapkan {PHOTO_SESSION_DURATION_MINUTES} menit dengan
          jeda {PHOTO_SESSION_BUFFER_MINUTES} menit antar sesi.
        </p>
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
      <label className="block text-sm font-medium">
        URL foto sampul (opsional)
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
      >
        {packageRecord ? "Simpan perubahan" : "Buat package"}
      </button>
    </form>
  );
}
