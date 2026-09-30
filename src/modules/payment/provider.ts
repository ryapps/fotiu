import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";

const chargeResponseSchema = z
  .object({
    order_id: z.string(),
    transaction_id: z.string().min(1),
    transaction_status: z.string(),
    gross_amount: z.union([z.string(), z.number()]).transform(String),
    actions: z
      .array(
        z.object({ name: z.string(), url: z.string().url() }).passthrough(),
      )
      .optional(),
  })
  .passthrough();

const statusResponseSchema = z
  .object({
    order_id: z.string(),
    transaction_id: z.string().min(1),
    transaction_status: z.string(),
    gross_amount: z.union([z.string(), z.number()]).transform(String),
    actions: z
      .array(
        z.object({ name: z.string(), url: z.string().url() }).passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type QrisResult = {
  orderId: string;
  transactionId: string;
  transactionStatus: string;
  grossAmount: string;
  qrImageUrl: string;
};

export class PaymentProviderError extends Error {
  constructor(message = "Payment provider request failed.") {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export class MidtransNotFoundError extends PaymentProviderError {
  constructor() {
    super("Transaction is not yet present at Midtrans.");
    this.name = "MidtransNotFoundError";
  }
}

function getBaseUrl() {
  return env.MIDTRANS_ENVIRONMENT === "production"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

function getAuthorization(serverKey: string) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

async function requestMidtrans(
  path: string,
  init: RequestInit,
  serverKey: string,
) {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: getAuthorization(serverKey),
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new PaymentProviderError("Midtrans could not be reached.");
  }

  if (response.status === 404) throw new MidtransNotFoundError();
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new PaymentProviderError();
  return body;
}

function safeQrImageUrl(
  actions: Array<{ name: string; url: string }> | undefined,
  transactionId: string,
) {
  const action =
    actions?.find((item) => item.name === "generate-qr-code-v2") ??
    actions?.find((item) => item.name === "generate-qr-code");
  if (action) {
    const url = new URL(action.url);
    if (
      url.protocol === "https:" &&
      ["api.midtrans.com", "api.sandbox.midtrans.com"].includes(url.hostname) &&
      /^\/v[24]\/qris\//.test(url.pathname)
    )
      return url.toString();
  }

  return `${getBaseUrl()}/v2/qris/${encodeURIComponent(transactionId)}/qr-code`;
}

function sameGrossAmount(left: string, amount: number) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(left);
  if (!match) return false;
  const fractionalDigits = (match[2] ?? "").padEnd(2, "0");
  const wholeDigits = match[1].replace(/^0+(?=\d)/, "");
  return fractionalDigits === "00" && wholeDigits === String(amount);
}

function parseQrisResponse(
  body: unknown,
  orderId: string,
  amount: number,
): QrisResult {
  const parsed = chargeResponseSchema.safeParse(body);
  if (
    !parsed.success ||
    parsed.data.order_id !== orderId ||
    !sameGrossAmount(parsed.data.gross_amount, amount)
  ) {
    throw new PaymentProviderError(
      "Midtrans returned an invalid transaction response.",
    );
  }
  if (parsed.data.transaction_status !== "pending") {
    throw new PaymentProviderError(
      "Midtrans did not create a pending QRIS transaction.",
    );
  }
  return {
    orderId,
    transactionId: parsed.data.transaction_id,
    transactionStatus: parsed.data.transaction_status,
    grossAmount: parsed.data.gross_amount,
    qrImageUrl: safeQrImageUrl(parsed.data.actions, parsed.data.transaction_id),
  };
}

function formatMidtransOrderTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} +0700`;
}

async function getExistingPendingQris(
  orderId: string,
  amount: number,
  serverKey: string,
) {
  const body = await requestMidtrans(
    `/v2/${encodeURIComponent(orderId)}/status`,
    { method: "GET" },
    serverKey,
  );
  const parsed = statusResponseSchema.safeParse(body);
  if (
    !parsed.success ||
    parsed.data.order_id !== orderId ||
    !sameGrossAmount(parsed.data.gross_amount, amount)
  ) {
    throw new PaymentProviderError(
      "Midtrans status response did not match this payment.",
    );
  }
  if (parsed.data.transaction_status !== "pending") {
    throw new PaymentProviderError(
      "The existing Midtrans transaction is no longer pending.",
    );
  }
  return {
    orderId,
    transactionId: parsed.data.transaction_id,
    transactionStatus: parsed.data.transaction_status,
    grossAmount: parsed.data.gross_amount,
    qrImageUrl: safeQrImageUrl(parsed.data.actions, parsed.data.transaction_id),
  } satisfies QrisResult;
}

export async function createQris(input: {
  orderId: string;
  amount: number;
  expiresAt: Date;
  durationMinutes: number;
  serverKey: string;
}): Promise<QrisResult> {
  try {
    return await getExistingPendingQris(
      input.orderId,
      input.amount,
      input.serverKey,
    );
  } catch (error) {
    if (!(error instanceof MidtransNotFoundError)) throw error;
  }

  const orderTime = new Date(
    input.expiresAt.getTime() - input.durationMinutes * 60_000,
  );
  let body: unknown;
  try {
    body = await requestMidtrans(
      "/v2/charge",
      {
        method: "POST",
        body: JSON.stringify({
          payment_type: "qris",
          qris: { acquirer: "gopay" },
          transaction_details: {
            order_id: input.orderId,
            gross_amount: input.amount,
          },
          item_details: [
            {
              id: input.orderId,
              price: input.amount,
              quantity: 1,
              name: "Booking Fotiu",
            },
          ],
          custom_expiry: {
            order_time: formatMidtransOrderTime(orderTime),
            expiry_duration: input.durationMinutes,
            unit: "minute",
          },
        }),
      },
      input.serverKey,
    );
  } catch (error) {
    // A request can time out after Midtrans creates the charge. The stable order id
    // lets the retry recover its pending QR instead of creating a second payment.
    if (error instanceof MidtransNotFoundError) throw error;
    try {
      return await getExistingPendingQris(
        input.orderId,
        input.amount,
        input.serverKey,
      );
    } catch (statusError) {
      if (statusError instanceof MidtransNotFoundError) throw error;
      throw statusError;
    }
  }

  return parseQrisResponse(body, input.orderId, input.amount);
}

export function verifyWebhookSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
  serverKey: string;
}) {
  if (!/^[0-9a-f]{128}$/i.test(input.signatureKey)) return false;
  const expected = createHash("sha512")
    .update(
      `${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`,
    )
    .digest();
  const received = Buffer.from(input.signatureKey, "hex");
  return (
    received.length === expected.length && timingSafeEqual(expected, received)
  );
}

export function mapStatus(transactionStatus: string) {
  switch (transactionStatus.toLowerCase()) {
    case "pending":
      return "PENDING" as const;
    case "settlement":
    case "capture":
      return "PAID" as const;
    case "expire":
      return "EXPIRED" as const;
    case "cancel":
    case "deny":
      return "FAILED" as const;
    default:
      return "UNKNOWN" as const;
  }
}

export function isGrossAmountEqual(grossAmount: string, amount: number) {
  return sameGrossAmount(grossAmount, amount);
}
