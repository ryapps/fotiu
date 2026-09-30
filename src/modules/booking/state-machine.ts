import type { BookingStatus, Prisma } from "@prisma/client";

const allowedTransitions: Record<BookingStatus, readonly BookingStatus[]> = {
  WAITING_PAYMENT: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["CANCELLED", "COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus) {
  return allowedTransitions[from].includes(to);
}

export async function transitionBookings(
  tx: Prisma.TransactionClient,
  from: BookingStatus,
  to: BookingStatus,
  where: Prisma.BookingWhereInput,
  data: Prisma.BookingUpdateManyMutationInput = {},
) {
  if (!canTransitionBooking(from, to)) {
    throw new Error(`Invalid booking state transition: ${from} -> ${to}`);
  }

  return tx.booking.updateMany({
    where: { ...where, status: from },
    data: { ...data, status: to },
  });
}

export async function transitionBooking(
  tx: Prisma.TransactionClient,
  id: string,
  from: BookingStatus,
  to: BookingStatus,
  data: Prisma.BookingUpdateManyMutationInput = {},
) {
  const result = await transitionBookings(tx, from, to, { id }, data);
  return result.count === 1;
}
