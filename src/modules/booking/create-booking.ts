import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { expireStaleHolds } from "@/modules/booking/expiry";
import { getPackageAvailabilityWithClient } from "@/modules/scheduling/availability-service";
import { getLocalDate } from "@/modules/scheduling/time";

export type BookingErrorCode =
  "NOT_FOUND" | "HOLD_LIMIT" | "CONFLICT" | "INVALID";

export class BookingRuleError extends Error {
  constructor(
    readonly code: BookingErrorCode,
    readonly packageSlug: string | null,
  ) {
    super(code);
    this.name = "BookingRuleError";
  }
}

export type CreateBookingInput = {
  packageId: string;
  startAt: Date;
  customerNote?: string;
};

function generateBookingCode(now: Date) {
  const date = getLocalDate(now, env.STUDIO_TIMEZONE).replaceAll("-", "");
  return `FT-${date}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function isExclusionConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const metaText = error.meta ? JSON.stringify(error.meta) : "";
  return (
    (error.code === "P2010" && metaText.includes("23P01")) ||
    (error.code === "P2004" && metaText.includes("bookings_no_overlap")) ||
    error.message.includes("bookings_no_overlap")
  );
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createBookingForCustomer(
  userId: string,
  input: CreateBookingInput,
  now = new Date(),
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateBookingCode(now);

    try {
      const booking = await prisma.$transaction(
        async (tx) => {
          const customerRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE
        `;
          if (customerRows.length === 0) {
            throw new BookingRuleError("NOT_FOUND", null);
          }

          await expireStaleHolds(tx, now);

          const packageRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "packages"
          WHERE "id" = ${input.packageId} AND "isActive" = TRUE
          FOR SHARE
        `;
          if (packageRows.length === 0) {
            throw new BookingRuleError("NOT_FOUND", null);
          }

          const photoPackage = await tx.package.findUnique({
            where: { id: input.packageId },
            select: {
              id: true,
              slug: true,
              name: true,
              price: true,
            },
          });
          if (!photoPackage) throw new BookingRuleError("NOT_FOUND", null);

          const duplicate = await tx.booking.findFirst({
            where: {
              userId,
              packageId: photoPackage.id,
              startAt: input.startAt,
              status: { in: ["WAITING_PAYMENT", "CONFIRMED"] },
            },
            select: { id: true },
          });
          if (duplicate) {
            throw new BookingRuleError("CONFLICT", photoPackage.slug);
          }

          const activeHolds = await tx.booking.count({
            where: {
              userId,
              status: "WAITING_PAYMENT",
              holdExpiresAt: { gt: now },
            },
          });
          if (activeHolds >= env.MAX_ACTIVE_HOLDS_PER_USER) {
            throw new BookingRuleError("HOLD_LIMIT", photoPackage.slug);
          }

          const date = getLocalDate(input.startAt, env.STUDIO_TIMEZONE);
          const availability = await getPackageAvailabilityWithClient(
            tx,
            photoPackage.id,
            date,
            now,
          );
          const slot = availability?.slots.find(
            (candidate) =>
              new Date(candidate.startAt).getTime() === input.startAt.getTime(),
          );
          if (!slot) throw new BookingRuleError("CONFLICT", photoPackage.slug);

          const holdExpiresAt = new Date(
            now.getTime() + env.BOOKING_HOLD_MINUTES * 60_000,
          );
          return tx.booking.create({
            data: {
              code,
              userId,
              packageId: photoPackage.id,
              packageNameSnapshot: photoPackage.name,
              priceSnapshot: photoPackage.price,
              startAt: new Date(slot.startAt),
              endAt: new Date(slot.endAt),
              status: "WAITING_PAYMENT",
              holdExpiresAt,
              customerNote: input.customerNote || null,
              payment: {
                create: {
                  provider: "midtrans",
                  providerOrderId: code,
                  amount: photoPackage.price,
                  status: "UNPAID",
                  expiresAt: holdExpiresAt,
                },
              },
            },
            select: {
              id: true,
              code: true,
              packageNameSnapshot: true,
              priceSnapshot: true,
              startAt: true,
              endAt: true,
              status: true,
              holdExpiresAt: true,
            },
          });
        },
        { maxWait: 15_000, timeout: 15_000 },
      );

      return { ok: true as const, booking };
    } catch (error) {
      if (error instanceof BookingRuleError) {
        return {
          ok: false as const,
          code: error.code,
          packageSlug: error.packageSlug,
        };
      }
      if (isExclusionConstraintError(error)) {
        return {
          ok: false as const,
          code: "CONFLICT" as const,
          packageSlug: null,
        };
      }
      if (isUniqueError(error)) {
        const existingCode = await prisma.booking.findUnique({
          where: { code },
          select: { id: true },
        });
        if (!existingCode) throw error;
        if (attempt < 2) continue;
      }
      throw error;
    }
  }

  return { ok: false as const, code: "CONFLICT" as const, packageSlug: null };
}
