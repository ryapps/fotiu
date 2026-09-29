import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for booking constraint integration tests.",
  );
}

const prisma = new PrismaClient({
  datasources: { db: { url: testDatabaseUrl } },
});

const fixtureToken = randomUUID();
let userId: string;
let packageId: string;

async function insertBooking(
  status: "WAITING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "EXPIRED",
  startAt: Date,
  endAt: Date,
) {
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "bookings" (
      "id", "code", "userId", "packageId", "packageNameSnapshot",
      "priceSnapshot", "startAt", "endAt", "status", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${`integration-${id}`}, ${userId}, ${packageId}, 'Integration fixture',
      100000, ${startAt}, ${endAt}, ${status}::"BookingStatus", NOW(), NOW()
    )
  `;

  return id;
}

function expectExclusionViolation(promise: Promise<unknown>) {
  return expect(promise).rejects.toMatchObject({
    code: "P2010",
    meta: { code: "23P01" },
  });
}

function expectCheckViolation(promise: Promise<unknown>) {
  return expect(promise).rejects.toMatchObject({
    code: "P2010",
    meta: { code: "23514" },
  });
}

describe("booking anti-overlap constraint", () => {
  beforeAll(async () => {
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        googleSub: `integration-${fixtureToken}`,
        email: `integration-${fixtureToken}@fotiu.test`,
        name: "Integration Test",
      },
    });
    userId = user.id;

    const packageRecord = await prisma.package.create({
      data: {
        slug: `integration-${fixtureToken}`,
        name: "Integration Fixture",
        description: "Temporary row for database constraint tests.",
        price: 100_000,
        durationMinutes: 60,
      },
    });
    packageId = packageRecord.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.$executeRaw`
        DELETE FROM "payments"
        WHERE "bookingId" IN (SELECT "id" FROM "bookings" WHERE "userId" = ${userId})
      `;
    }
    if (userId) await prisma.booking.deleteMany({ where: { userId } });
    if (packageId) await prisma.package.delete({ where: { id: packageId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rejects overlapping active bookings with SQLSTATE 23P01", async () => {
    await insertBooking(
      "CONFIRMED",
      new Date("2030-01-01T10:00:00.000Z"),
      new Date("2030-01-01T11:00:00.000Z"),
    );

    await expectExclusionViolation(
      insertBooking(
        "WAITING_PAYMENT",
        new Date("2030-01-01T10:30:00.000Z"),
        new Date("2030-01-01T11:30:00.000Z"),
      ),
    );
  });

  it("allows adjacent sessions because the time range is half-open", async () => {
    await insertBooking(
      "CONFIRMED",
      new Date("2030-01-02T10:00:00.000Z"),
      new Date("2030-01-02T11:00:00.000Z"),
    );

    await expect(
      insertBooking(
        "CONFIRMED",
        new Date("2030-01-02T11:00:00.000Z"),
        new Date("2030-01-02T12:00:00.000Z"),
      ),
    ).resolves.toBeDefined();
  });

  it("allows overlaps with CANCELLED and EXPIRED history", async () => {
    const startAt = new Date("2030-01-03T10:00:00.000Z");
    const endAt = new Date("2030-01-03T11:00:00.000Z");
    await insertBooking("CANCELLED", startAt, endAt);
    await insertBooking("EXPIRED", startAt, endAt);

    await expect(
      insertBooking("CONFIRMED", startAt, endAt),
    ).resolves.toBeDefined();
  });

  it("keeps payment amount equal to the booking snapshot", async () => {
    const bookingId = await insertBooking(
      "WAITING_PAYMENT",
      new Date("2030-01-05T10:00:00.000Z"),
      new Date("2030-01-05T11:00:00.000Z"),
    );

    await expectCheckViolation(
      prisma.$executeRaw`
        INSERT INTO "payments" (
          "id", "bookingId", "provider", "providerOrderId", "amount", "status",
          "needsReview", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${bookingId}, 'midtrans', ${`integration-${randomUUID()}`},
          90000, 'UNPAID'::"PaymentStatus", false, NOW(), NOW()
        )
      `,
    );

    await prisma.$executeRaw`
      INSERT INTO "payments" (
        "id", "bookingId", "provider", "providerOrderId", "amount", "status",
        "needsReview", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${bookingId}, 'midtrans', ${`integration-${randomUUID()}`},
        100000, 'UNPAID'::"PaymentStatus", false, NOW(), NOW()
      )
    `;

    await expectCheckViolation(
      prisma.$executeRaw`
        UPDATE "bookings"
        SET "priceSnapshot" = 100001, "updatedAt" = NOW()
        WHERE "id" = ${bookingId}
      `,
    );
  });

  it("permits updating a booking without self-conflict and rejects a conflicting reschedule", async () => {
    const bookingId = await insertBooking(
      "CONFIRMED",
      new Date("2030-01-04T10:00:00.000Z"),
      new Date("2030-01-04T11:00:00.000Z"),
    );
    await insertBooking(
      "CONFIRMED",
      new Date("2030-01-04T11:00:00.000Z"),
      new Date("2030-01-04T12:00:00.000Z"),
    );

    await expect(
      prisma.booking.update({
        where: { id: bookingId },
        data: { customerNote: "same slot update" },
      }),
    ).resolves.toBeDefined();

    await expectExclusionViolation(
      prisma.$executeRaw`
        UPDATE "bookings"
        SET "endAt" = ${new Date("2030-01-04T11:30:00.000Z")}, "updatedAt" = NOW()
        WHERE "id" = ${bookingId}
      `,
    );
  });
});
