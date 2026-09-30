import type { BookingStatus, PaymentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const bookingLabels: Record<BookingStatus, string> = {
  WAITING_PAYMENT: "Menunggu pembayaran",
  CONFIRMED: "Dikonfirmasi",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
};

const paymentLabels: Record<PaymentStatus, string> = {
  UNPAID: "Belum dibayar",
  PENDING: "Menunggu pembayaran",
  PAID: "Lunas",
  FAILED: "Gagal",
  EXPIRED: "Kedaluwarsa",
  REFUNDED: "Refund selesai",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const variant =
    status === "CONFIRMED" || status === "COMPLETED"
      ? "default"
      : status === "CANCELLED"
        ? "destructive"
        : "secondary";

  return <Badge variant={variant}>{bookingLabels[status]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const variant =
    status === "PAID"
      ? "default"
      : status === "FAILED"
        ? "destructive"
        : "secondary";

  return <Badge variant={variant}>{paymentLabels[status]}</Badge>;
}
