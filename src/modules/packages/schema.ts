import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug wajib diisi.")
  .max(80, "Slug maksimal 80 karakter.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Gunakan huruf kecil, angka, dan tanda hubung.",
  );

export const packageInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, "Nama wajib diisi.").max(120),
  description: z.string().trim().min(1, "Deskripsi wajib diisi.").max(3000),
  price: z.number().int().min(0, "Harga tidak boleh negatif.").safe(),
  durationMinutes: z
    .number()
    .int()
    .positive("Durasi harus lebih dari 0.")
    .safe(),
  bufferMinutes: z.number().int().min(0).safe(),
  coverImageUrl: z.union([z.url(), z.literal("")]).refine((value) => {
    if (value === "") return true;
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "URL foto harus menggunakan HTTP atau HTTPS."),
  sortOrder: z.number().int().min(0).safe(),
});

export type PackageInput = z.infer<typeof packageInputSchema>;

export function parsePackageFormData(formData: FormData) {
  const numberField = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  };

  return packageInputSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    price: numberField("price"),
    durationMinutes: numberField("durationMinutes"),
    bufferMinutes: numberField("bufferMinutes"),
    coverImageUrl: formData.get("coverImageUrl") ?? "",
    sortOrder: numberField("sortOrder"),
  });
}
