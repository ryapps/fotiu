"use client";

import { useState } from "react";

export function SandboxQrSimulator({ qrImageUrl }: { qrImageUrl: string }) {
  const [message, setMessage] = useState("");

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(qrImageUrl);
      setMessage("URL QR berhasil disalin.");
    } catch {
      setMessage("Salin URL QR di kolom secara manual.");
    }
  }

  return (
    <aside className="w-full rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <h2 className="font-semibold">Tes pembayaran Midtrans Sandbox</h2>
      <p className="mt-2 text-sm">
        Jangan scan QR sandbox memakai aplikasi bank atau QRIS sungguhan. Buka
        simulator sandbox, salin URL gambar QR ini, lalu masukkan URL tersebut
        ke simulator untuk mengubah status transaksi tanpa memakai saldo.
      </p>
      <label
        className="mt-3 block text-sm font-medium"
        htmlFor="sandbox-qr-url"
      >
        URL gambar QR sandbox
      </label>
      <input
        id="sandbox-qr-url"
        readOnly
        value={qrImageUrl}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs text-foreground"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copyUrl}
          className="rounded-md border border-amber-800/30 px-3 py-2 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900"
        >
          Salin URL QR
        </button>
        <a
          href="https://simulator.sandbox.midtrans.com/openapi/qris/index"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium underline underline-offset-4"
        >
          Buka simulator QRIS Midtrans
        </a>
      </div>
      <p className="mt-2 min-h-5 text-sm" aria-live="polite">
        {message}
      </p>
    </aside>
  );
}
