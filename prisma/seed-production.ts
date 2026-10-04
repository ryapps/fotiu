import { BookingStatus, CancelledBy, PrismaClient } from "@prisma/client";
import "dotenv/config";
import { z } from "zod";

const productionSeedSchema = z.object({
  DATABASE_URL_PRODUCTION: z.string().url().startsWith("postgresql://"),
  PRODUCTION_SEED_TARGET: z.string().min(1),
});

const parsed = productionSeedSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    "Production demo seed requires DATABASE_URL and PRODUCTION_SEED_TARGET.",
  );
}

const seedEnv = parsed.data;
const databaseUrl = new URL(seedEnv.DATABASE_URL_PRODUCTION);
const databaseHost = databaseUrl.hostname.toLowerCase();
const databaseName = databaseUrl.pathname.slice(1).split("/")[0];
const target = `${databaseHost}/${databaseName}`;

if (["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error("Production seed refuses to run against a local database.");
}

if (seedEnv.PRODUCTION_SEED_TARGET !== target) {
  throw new Error(
    `Production seed target confirmation mismatch. Set PRODUCTION_SEED_TARGET to the verified target: ${target}`,
  );
}

const prisma = new PrismaClient({
  datasources: { db: { url: seedEnv.DATABASE_URL_PRODUCTION } },
});

const demoCustomers = [
  {
    id: "seed-demo-customer-001",
    googleSub: "fotiu-demo-google-sub-001",
    email: "demo.customer.001@example.invalid",
    name: "Demo Customer 001",
    bookingCode: "DEMO-SEED-BOOKING-001",
    daysAgo: 21,
  },
  {
    id: "seed-demo-customer-002",
    googleSub: "fotiu-demo-google-sub-002",
    email: "demo.customer.002@example.invalid",
    name: "Demo Customer 002",
    bookingCode: "DEMO-SEED-BOOKING-002",
    daysAgo: 14,
  },
  {
    id: "seed-demo-customer-003",
    googleSub: "fotiu-demo-google-sub-003",
    email: "demo.customer.003@example.invalid",
    name: "Demo Customer 003",
    bookingCode: "DEMO-SEED-BOOKING-003",
    daysAgo: 7,
  },
] as const;

async function main() {
  const photoPackage = await prisma.package.findFirst({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      price: true,
      durationMinutes: true,
      bufferMinutes: true,
    },
  });

  if (!photoPackage) {
    throw new Error(
      "Production demo seed requires at least one active package. No customer or booking data was written.",
    );
  }

  await prisma.$transaction(
    async (transaction) => {
      for (const customer of demoCustomers) {
        const existingUser = await transaction.user.findUnique({
          where: { email: customer.email },
          select: { id: true, googleSub: true },
        });
        if (
          existingUser &&
          (existingUser.id !== customer.id ||
            existingUser.googleSub !== customer.googleSub)
        ) {
          throw new Error(
            `Demo seed email collision detected for ${customer.email}; no data was changed.`,
          );
        }
        const user =
          existingUser ??
          (await transaction.user.create({
            data: {
              id: customer.id,
              googleSub: customer.googleSub,
              email: customer.email,
              name: customer.name,
            },
            select: { id: true },
          }));

        const startAt = new Date();
        startAt.setUTCDate(startAt.getUTCDate() - customer.daysAgo);
        startAt.setUTCHours(10, 0, 0, 0);
        const createdAt = new Date(startAt.getTime() - 7 * 24 * 60 * 60 * 1000);
        const cancelledAt = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);

        const existingBooking = await transaction.booking.findUnique({
          where: { code: customer.bookingCode },
          select: { userId: true, status: true, cancelReason: true },
        });
        if (
          existingBooking &&
          (existingBooking.userId !== user.id ||
            existingBooking.status !== BookingStatus.CANCELLED ||
            existingBooking.cancelReason !==
              "Seed demo sintetis; bukan booking customer nyata.")
        ) {
          throw new Error(
            `Demo seed booking collision detected for ${customer.bookingCode}; no data was changed.`,
          );
        }

        if (!existingBooking) {
          await transaction.booking.create({
            data: {
              code: customer.bookingCode,
              userId: user.id,
              packageId: photoPackage.id,
              packageNameSnapshot: photoPackage.name,
              priceSnapshot: photoPackage.price,
              startAt,
              endAt: new Date(
                startAt.getTime() +
                  (photoPackage.durationMinutes + photoPackage.bufferMinutes) *
                    60_000,
              ),
              status: BookingStatus.CANCELLED,
              cancelledAt,
              cancelledBy: CancelledBy.SYSTEM,
              cancelReason: "Seed demo sintetis; bukan booking customer nyata.",
              createdAt,
            },
          });
        }
      }
    },
    { maxWait: 15_000, timeout: 30_000 },
  );

  console.info(
    `Production demo seed completed for ${target}. ${demoCustomers.length} synthetic customers and historical cancelled bookings were ensured. Admin, operating hours, packages, payments, and gallery were not modified.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Production database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
