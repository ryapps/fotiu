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
    providerKey: z.literal("mock"),
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
    const token = createDeviceToken();
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "booths" ("id", "name", "deviceId", "providerKey", "agentTokenHash", "isMaintenance", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${parsed.data.name}, ${parsed.data.deviceId}, ${parsed.data.providerKey}, ${hashDeviceToken(token)}, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("deviceId") DO NOTHING
      RETURNING "id"
    `;
    if (rows.length === 0) return { error: "Device ID sudah digunakan." };
    revalidatePath("/admin/booths");
    return {
      token,
      deviceId: parsed.data.deviceId,
      message:
        "Booth dibuat. Salin token sekarang; token mentah tidak akan ditampilkan lagi.",
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
