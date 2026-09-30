"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PaymentStatusPollerProps = {
  bookingId: string;
  bookingStatus: string;
  paymentStatus: string | null;
  holdExpiresAt: string | null;
};

export function PaymentStatusPoller({
  bookingId,
  bookingStatus,
  paymentStatus,
  holdExpiresAt,
}: PaymentStatusPollerProps) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (bookingStatus !== "WAITING_PAYMENT" || !holdExpiresAt) return;
    const expiry = new Date(holdExpiresAt).getTime();
    const updateCountdown = () => {
      const totalSeconds = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      const minutes = Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (totalSeconds % 60).toString().padStart(2, "0");
      setRemaining(`${minutes}:${seconds}`);
      if (totalSeconds === 0) router.refresh();
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [bookingStatus, holdExpiresAt, router]);

  useEffect(() => {
    if (bookingStatus !== "WAITING_PAYMENT") return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/bookings/${encodeURIComponent(bookingId)}/status`,
          {
            cache: "no-store",
            headers: { accept: "application/json" },
          },
        );
        if (!response.ok) return;
        const latest = (await response.json()) as {
          bookingStatus?: string;
          paymentStatus?: string | null;
        };
        if (
          active &&
          (latest.bookingStatus !== bookingStatus ||
            latest.paymentStatus !== paymentStatus)
        ) {
          router.refresh();
        }
      } catch {
        // A temporary polling failure must not change payment state.
      }
    };
    const timer = window.setInterval(() => void poll(), 5000);
    void poll();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [bookingId, bookingStatus, paymentStatus, router]);

  if (bookingStatus !== "WAITING_PAYMENT" || !holdExpiresAt) return null;
  return (
    <p className="mt-6 rounded-md bg-secondary/60 p-3 text-sm" role="status">
      Sisa waktu pembayaran: <strong>{remaining ?? "--:--"}</strong>. Status
      akan diperbarui otomatis.
    </p>
  );
}
