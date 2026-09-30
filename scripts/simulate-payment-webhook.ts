import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";

const prisma = new PrismaClient();

async function main() {
  const orderId = process.argv[2];
  const appUrl = new URL(env.APP_URL);
  const databaseUrl = new URL(env.DATABASE_URL);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (
    process.env.NODE_ENV === "production" ||
    env.MIDTRANS_ENVIRONMENT !== "sandbox" ||
    !localHosts.has(appUrl.hostname) ||
    !localHosts.has(databaseUrl.hostname)
  ) {
    throw new Error(
      "Webhook simulation is restricted to local sandbox configuration.",
    );
  }
  if (!env.MIDTRANS_SERVER_KEY) {
    throw new Error(
      "Set MIDTRANS_SERVER_KEY in .env before simula  ting a webhook.",
    );
  }
  if (!orderId || orderId.length > 64) {
    throw new Error("Usage: npm run payment:simulate -- <booking-code>");
  }

  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: orderId },
    select: {
      amount: true,
      status: true,
      booking: { select: { status: true } },
    },
  });
  if (!payment) throw new Error("No payment found for that booking code.");
  if (payment.booking.status !== "WAITING_PAYMENT") {
    throw new Error("Only a WAITING_PAYMENT booking can be simulated.");
  }

  const statusCode = "200";
  const grossAmount = `${payment.amount}.00`;
  const transactionId = `local-sim-${randomUUID()}`;
  const signatureKey = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${env.MIDTRANS_SERVER_KEY}`)
    .digest("hex");
  const response = await fetch(new URL("/api/webhooks/payment", appUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_id: transactionId,
      transaction_status: "settlement",
      payment_type: "qris",
      fraud_status: "accept",
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(`Webhook simulation failed with HTTP ${response.status}.`);
  console.log(`Local webhook accepted (HTTP ${response.status}).`);
  console.log(result);
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Webhook simulation failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
