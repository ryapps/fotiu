"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import {
  createDeviceToken,
  hashDeviceToken,
} from "@/modules/photobooth/device-auth";

export type BoothCredentialActionState = {
  token?: string;
  deviceId?: string;
  message?: string;
  error?: string;
};

const schema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("create"),
    name: z.string().trim().min(1).max(80),
    deviceId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,128}$/),
    providerKey: z.enum(["mock", "freebooth", "photobooth_app"]),
  }),
  z.object({
    operation: z.literal("provider"),
    boothId: z.string().trim().min(1).max(64),
    providerKey: z.enum(["mock", "freebooth", "photobooth_app"]),
  }),
  z.object({
    operation: z.literal("rotate"),
    boothId: z.string().trim().min(1).max(64),
  }),
  z.object({
    operation: z.literal("revoke"),
    boothId: z.string().trim().min(1).max(64),
  }),
]);

export async function manageBoothCredentialAction(
  _previous: BoothCredentialActionState,
  formData: FormData,
): Promise<BoothCredentialActionState> {
  await requireAdmin();
  const parsed = schema.safeParse({
    operation: formData.get("operation"),
    name: formData.get("name"),
    deviceId: formData.get("deviceId"),
    providerKey: formData.get("providerKey"),
    boothId: formData.get("boothId"),
  });
  if (!parsed.success)
    return { error: "Data booth tidak valid atau provider belum didukung." };

  if (parsed.data.operation === "create") {
    const boothInput = parsed.data;
    const token = createDeviceToken();
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "booths" IN EXCLUSIVE MODE`;
      const existing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "booths" LIMIT 1
      `;
      if (existing.length) return [];
      return tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "booths" ("id", "name", "deviceId", "providerKey", "agentTokenHash", "isMaintenance", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${boothInput.name}, ${boothInput.deviceId}, ${boothInput.providerKey}, ${hashDeviceToken(token)}, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("deviceId") DO NOTHING
        RETURNING "id"
      `;
    });
    if (rows.length === 0) {
      const existing = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "booths" LIMIT 1
      `;
      if (existing.length)
        return { error: "P0 saat ini hanya mendukung satu booth." };
    }
    if (rows.length === 0) return { error: "Device ID sudah digunakan." };
    revalidatePath("/admin/booths");
    return {
      token,
      deviceId: parsed.data.deviceId,
      message:
        "Booth dibuat. Salin token sekarang; token mentah tidak akan ditampilkan lagi.",
    };
  }

  if (parsed.data.operation === "provider") {
    const providerInput = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      const booths = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "booths" WHERE "id" = ${providerInput.boothId} FOR UPDATE
      `;
      if (!booths[0]) return "NOT_FOUND";
      const activeSessions = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "photo_sessions"
        WHERE "boothId" = ${providerInput.boothId}
          AND "status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')
        LIMIT 1
      `;
      const activeCommands = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "booth_commands"
        WHERE "boothId" = ${providerInput.boothId}
          AND "status" IN ('PENDING', 'PROCESSING')
        LIMIT 1
      `;
      if (activeSessions.length || activeCommands.length) return "IN_USE";
      await tx.$executeRaw`
        UPDATE "booths" SET "providerKey" = ${providerInput.providerKey}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${providerInput.boothId}
      `;
      return "UPDATED";
    });
    if (result === "NOT_FOUND") return { error: "Booth tidak ditemukan." };
    if (result === "IN_USE")
      return {
        error:
          "Provider tidak dapat diganti selama ada sesi atau command yang masih aktif.",
      };
    revalidatePath("/admin/booths");
    return {
      message:
        "Provider diperbarui. Sesuaikan BOOTH_PROVIDER_KEY di komputer booth dan restart agent.",
    };
  }

  if (parsed.data.operation === "rotate") {
    const token = createDeviceToken();
    const rows = await prisma.$queryRaw<Array<{ deviceId: string }>>`
      UPDATE "booths" SET "agentTokenHash" = ${hashDeviceToken(token)}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${parsed.data.boothId}
      RETURNING "deviceId"
    `;
    if (!rows[0]) return { error: "Booth tidak ditemukan." };
    revalidatePath("/admin/booths");
    return {
      token,
      deviceId: rows[0].deviceId,
      message:
        "Token dirotasi. Agent dengan token lama tidak dapat terhubung lagi.",
    };
  }

  const rows = await prisma.$queryRaw<Array<{ deviceId: string }>>`
    UPDATE "booths" SET "agentTokenHash" = ${hashDeviceToken(createDeviceToken())}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${parsed.data.boothId}
    RETURNING "deviceId"
  `;
  if (!rows[0]) return { error: "Booth tidak ditemukan." };
  revalidatePath("/admin/booths");
  return {
    deviceId: rows[0].deviceId,
    message:
      "Credential dicabut. Agent tidak dapat terhubung sampai token dirotasi.",
  };
}
