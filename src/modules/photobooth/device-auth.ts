import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function createDeviceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function authenticateBoothDevice(request: Request) {
  const authorization = request.headers.get("authorization");
  const match =
    authorization && /^Bearer ([A-Za-z0-9_-]{40,128})$/.exec(authorization);
  if (!match) return null;

  // Tokens have 256 bits of entropy; an indexed SHA-256 digest avoids storing
  // the bearer secret while preserving constant-format credential lookup.
  const tokenHash = hashDeviceToken(match[1]);
  const booths = await prisma.$queryRaw<
    Array<{
      id: string;
      deviceId: string;
      providerKey: string;
    }>
  >`SELECT "id", "deviceId", "providerKey" FROM "booths" WHERE "agentTokenHash" = ${tokenHash} LIMIT 1`;
  return booths[0] ?? null;
}
