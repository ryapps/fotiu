import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { z } from "zod";

const seedEnvSchema = z.object({
  ADMIN_SEED_EMAIL: z.email(),
  ADMIN_SEED_PASSWORD: z.string().min(12),
});

const parsedEnv = seedEnvSchema.safeParse(process.env);

if (!parsedEnv.success || !parsedEnv.data) {
  throw new Error(
    "Seed requires a valid ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD (minimum 12 characters) in .env.",
  );
}

const seedEnv = parsedEnv.data;

const prisma = new PrismaClient();

async function main() {
  const email = seedEnv.ADMIN_SEED_EMAIL.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(seedEnv.ADMIN_SEED_PASSWORD, 12);

  await prisma.admin.upsert({
    where: { email },
    create: { email, passwordHash, name: "Fotiu Admin" },
    update: { passwordHash, name: "Fotiu Admin", isActive: true },
  });

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    await prisma.operatingHour.upsert({
      where: { weekday },
      create: {
        weekday,
        isOpen: weekday !== 0,
        openTime: "09:00",
        closeTime: "17:00",
      },
      update: {},
    });
  }

  const packages = [
    {
      slug: "portrait-basic",
      name: "Portrait Basic",
      description: "Sesi portrait untuk satu orang.",
      price: 20_000,
      durationMinutes: 10,
      bufferMinutes: 2,
      sortOrder: 1,
    },
    {
      slug: "family-session",
      name: "Family Session",
      description: "Sesi foto keluarga dengan waktu lebih panjang.",
      price: 40_000,
      durationMinutes: 10,
      bufferMinutes: 2,
      sortOrder: 2,
    },
    {
      slug: "graduation-session",
      name: "Graduation Session",
      description: "Sesi foto wisuda untuk mengabadikan momen kelulusan.",
      price: 30_000,
      durationMinutes: 10,
      bufferMinutes: 2,
      sortOrder: 3,
    },
  ];

  for (const packageData of packages) {
    const { slug, ...data } = packageData;
    await prisma.package.upsert({
      where: { slug },
      create: { slug, ...data },
      update: {},
    });
  }

  const galleryImages = [
    {
      id: "seed-gallery-portrait",
      imageUrl: "/images/gallery-portrait.svg",
      storageKey: "seed/gallery-portrait.svg",
      sortOrder: 1,
    },
    {
      id: "seed-gallery-family",
      imageUrl: "/images/gallery-family.svg",
      storageKey: "seed/gallery-family.svg",
      sortOrder: 2,
    },
    {
      id: "seed-gallery-graduation",
      imageUrl: "/images/gallery-graduation.svg",
      storageKey: "seed/gallery-graduation.svg",
      sortOrder: 3,
    },
  ];

  for (const image of galleryImages) {
    const { id, ...data } = image;
    await prisma.galleryImage.upsert({
      where: { id },
      create: { id, ...data, isPublished: true },
      update: { ...data, isPublished: true },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
