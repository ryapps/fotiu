import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { MIDTRANS_ENVIRONMENT: "sandbox" } }));

import {
  cancelQris,
  createQris,
  isGrossAmountEqual,
  mapStatus,
  verifyWebhookSignature,
} from "@/modules/payment/provider";

afterEach(() => vi.unstubAllGlobals());

describe("Midtrans provider helpers", () => {
  it("validates notification signatures in constant-time comparison", () => {
    const fields = {
      orderId: "FT-20260930-0123456789AB",
      statusCode: "200",
      grossAmount: "125000.00",
      serverKey: "test-server-key",
    };
    const signatureKey = createHash("sha512")
      .update(
        `${fields.orderId}${fields.statusCode}${fields.grossAmount}${fields.serverKey}`,
      )
      .digest("hex");
    expect(verifyWebhookSignature({ ...fields, signatureKey })).toBe(true);
    expect(
      verifyWebhookSignature({ ...fields, signatureKey: "f".repeat(128) }),
    ).toBe(false);
    expect(verifyWebhookSignature({ ...fields, signatureKey: "bad" })).toBe(
      false,
    );
  });

  it("maps QRIS statuses and compares Rupiah amounts without floating point", () => {
    expect(mapStatus("settlement")).toBe("PAID");
    expect(mapStatus("pending")).toBe("PENDING");
    expect(mapStatus("expire")).toBe("EXPIRED");
    expect(mapStatus("deny")).toBe("FAILED");
    expect(mapStatus("unknown")).toBe("UNKNOWN");
    expect(isGrossAmountEqual("123000.00", 123_000)).toBe(true);
    expect(isGrossAmountEqual("123000.50", 123_000)).toBe(false);
    expect(isGrossAmountEqual("1e5", 100_000)).toBe(false);
  });

  it("cancels a pending QRIS transaction by its stable order id", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(input), init });
        return Response.json({
          order_id: "FT-20260930-cancel-test",
          status_code: "200",
          transaction_status: "cancel",
        });
      }),
    );

    await cancelQris("FT-20260930-cancel-test", "test-server-key");

    expect(requests[0]?.url).toBe(
      "https://api.sandbox.midtrans.com/v2/FT-20260930-cancel-test/cancel",
    );
    expect(requests[0]?.init?.method).toBe("POST");
  });

  it("creates QRIS using booking code, server amount, and the configured expiry", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("/status"))
          return Response.json({
            status_code: "404",
            status_message: "Transaction doesn't exist.",
          });
        return Response.json({
          order_id: "FT-20260930-0123456789AB",
          transaction_id: "txn-test",
          transaction_status: "pending",
          gross_amount: "123000.00",
          actions: [
            {
              name: "generate-qr-code-v2",
              url: "https://api.sandbox.midtrans.com/v4/qris/txn-test/qr-code",
            },
          ],
        });
      }),
    );

    const result = await createQris({
      orderId: "FT-20260930-0123456789AB",
      amount: 123_000,
      expiresAt: new Date("2026-09-30T04:15:00.000Z"),
      durationMinutes: 15,
      serverKey: "test-server-key",
    });

    expect(result.transactionId).toBe("txn-test");
    expect(result.qrImageUrl).toBe(
      "https://api.sandbox.midtrans.com/v4/qris/txn-test/qr-code",
    );
    const charge = requests.at(-1);
    expect(charge?.url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const body = JSON.parse(String(charge?.init?.body)) as {
      transaction_details: { order_id: string; gross_amount: number };
      custom_expiry: { expiry_duration: number; unit: string };
    };
    expect(body.transaction_details).toEqual({
      order_id: "FT-20260930-0123456789AB",
      gross_amount: 123_000,
    });
    expect(body.custom_expiry).toEqual({
      order_time: "2026-09-30 11:00:00 +0700",
      expiry_duration: 15,
      unit: "minute",
    });
  });

  it("recovers a charge after a timeout by checking the stable Midtrans order id", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        calls += 1;
        const url = String(input);
        if (url.endsWith("/status")) {
          if (calls === 1)
            return Response.json({
              status_code: "404",
              status_message: "Transaction doesn't exist.",
            });
          return Response.json({
            order_id: "FT-20260930-timeout",
            transaction_id: "txn-recovered",
            transaction_status: "pending",
            gross_amount: "50000.00",
          });
        }
        throw new TypeError("simulated connection timeout");
      }),
    );
    const result = await createQris({
      orderId: "FT-20260930-timeout",
      amount: 50_000,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      durationMinutes: 10,
      serverKey: "test-server-key",
    });
    expect(calls).toBe(3);
    expect(result.transactionId).toBe("txn-recovered");
    expect(result.qrImageUrl).toContain("/v2/qris/txn-recovered/qr-code");
  });
});
