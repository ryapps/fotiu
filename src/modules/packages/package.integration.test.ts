import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";

const token = randomUUID();
const googleSub = `package-google-${token}`;
const email = `package-${token}@example.test`;

let userId: string;
const packageIds: string[] = [];

describe("package history rules", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { googleSub, email, name: "Package Integration Customer" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (packageIds.length > 0) {
      await prisma.booking.deleteMany({
        where: { packageId: { in: packageIds } },
      });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("preserves booking snapshot values and restricts deleting any package with history", async () => {
    const photoPackage = await prisma.package.create({
      data: {
        slug: `package-history-${token}`,
        name: "Original Package Name",
        description: "Integration fixture",
        price: 100_000,
        durationMinutes: 60,
      },
    });
    packageIds.push(photoPackage.id);

    const booking = await prisma.booking.create({
      data: {
        code: `package-${token}`,
        userId,
        packageId: photoPackage.id,
        packageNameSnapshot: "Original Package Name",
        priceSnapshot: 100_000,
        startAt: new Date("2035-01-01T10:00:00.000Z"),
        endAt: new Date("2035-01-01T11:00:00.000Z"),
        status: "EXPIRED",
      },
    });

    await prisma.package.update({
      where: { id: photoPackage.id },
      data: { name: "Updated Package Name", price: 125_000 },
    });
    const savedBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });

    expect(savedBooking.packageNameSnapshot).toBe("Original Package Name");
    expect(savedBooking.priceSnapshot).toBe(100_000);
    expect(savedBooking.priceSnapshot).not.toBe(125_000);

    await expect(
      prisma.package.delete({ where: { id: photoPackage.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.package.findUnique({ where: { id: photoPackage.id } }),
    ).resolves.not.toBeNull();

    await prisma.package.update({
      where: { id: photoPackage.id },
      data: { isActive: false },
    });
    await expect(
      prisma.package.findMany({
        where: { id: photoPackage.id, isActive: true },
      }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.package.findFirst({
        where: { slug: photoPackage.slug, isActive: true },
      }),
    ).resolves.toBeNull();
  });

  it("allows deleting a package that has never had a booking", async () => {
    const photoPackage = await prisma.package.create({
      data: {
        slug: `package-delete-${token}`,
        name: "Disposable Package Fixture",
        description: "Integration fixture",
        price: 0,
        durationMinutes: 1,
      },
    });
    packageIds.push(photoPackage.id);

    await prisma.package.delete({ where: { id: photoPackage.id } });
    packageIds.splice(packageIds.indexOf(photoPackage.id), 1);
    await expect(
      prisma.package.findUnique({ where: { id: photoPackage.id } }),
    ).resolves.toBeNull();
  });
});
