import "server-only";

import { z } from "zod";

export async function parseAgentJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 4096,
) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes)
    return { ok: false as const, status: 413, code: "PAYLOAD_TOO_LARGE" };
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes)
    return { ok: false as const, status: 413, code: "PAYLOAD_TOO_LARGE" };
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false as const, status: 400, code: "INVALID_JSON" };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    return { ok: false as const, status: 400, code: "INVALID_PAYLOAD" };
  return { ok: true as const, data: parsed.data };
}
