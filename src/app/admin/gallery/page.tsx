import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { GalleryItemControls } from "@/modules/gallery/gallery-item-controls";
import { GalleryUploadForm } from "@/modules/gallery/gallery-upload-form";
import Image from "next/image";

export const metadata = { title: "Gallery | Fotiu Admin" };

export default async function AdminGalleryPage() {
  await requireAdmin();
  const images = await prisma.galleryImage.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      imageUrl: true,
      isPublished: true,
      createdAt: true,
    },
  });
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <header className="rounded-[1.75rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-6 shadow-[0_20px_54px_rgba(40,80,150,0.07)] sm:p-8">
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Konten studio
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Kelola gallery
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gambar baru disimpan sebagai draft sampai admin memeriksanya.
        </p>
      </header>
      <GalleryUploadForm />
      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">
          Gambar{" "}
          <span className="text-muted-foreground">({images.length})</span>
        </h2>
        {images.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-primary/20 bg-white/60 p-8 text-center text-sm text-muted-foreground">
            Belum ada gambar gallery.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image) => (
              <li
                key={image.id}
                className="overflow-hidden rounded-2xl border border-primary/10 bg-white/85 shadow-[0_12px_28px_rgba(37,74,138,0.05)]"
              >
                <div className="relative h-56 bg-secondary/70">
                  <Image
                    src={image.imageUrl}
                    alt="Foto gallery Fotiu Studio"
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="grid gap-3 p-4">
                  <p className="text-sm text-muted-foreground">
                    {image.isPublished ? "Publik" : "Draft"}
                  </p>
                  <GalleryItemControls
                    id={image.id}
                    isPublished={image.isPublished}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
