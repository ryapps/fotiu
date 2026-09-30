import type { Prisma } from "@prisma/client";
import { transitionBookings } from "@/modules/booking/state-machine";

type ExpiryScope = { bookingId?: string };

export async function expireStaleHolds(
  tx: Prisma.TransactionClient,
  now = new Date(),
  scope: ExpiryScope = {},
) {
  const staleBookings = await tx.booking.findMany({
    where: {
      status: "WAITING_PAYMENT",
      holdExpiresAt: { lte: now },
      ...(scope.bookingId ? { id: scope.bookingId } : {}),
    },
    select: { id: true },
  });
  if (staleBookings.length === 0) return 0;

  const bookingIds = staleBookings.map((booking) => booking.id);
  const transitioned = await transitionBookings(
    tx,
    "WAITING_PAYMENT",
    "EXPIRED",
    { id: { in: bookingIds }, holdExpiresAt: { lte: now } },
  );

  await tx.payment.updateMany({
    where: {
      bookingId: { in: bookingIds },
      status: { in: ["UNPAID", "PENDING"] },
      booking: {
        is: { status: "EXPIRED", holdExpiresAt: { lte: now } },
      },
    },
    data: { status: "EXPIRED" },
  });

  return transitioned.count;
}
