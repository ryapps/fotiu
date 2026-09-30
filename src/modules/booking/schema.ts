import { z } from "zod";

const packageSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);

export const createBookingInputSchema = z.object({
  packageId: z.string().trim().min(1).max(64),
  startAt: z.iso.datetime({ offset: true }),
  customerNote: z.string().trim().max(1000).optional(),
});

export const bookingActionFormSchema = createBookingInputSchema.extend({
  packageSlug: packageSlugSchema,
});

export const bookingIdSchema = z.string().trim().min(1).max(64);

export const cancelMyBookingInputSchema = z.object({
  bookingId: bookingIdSchema,
  reason: z.string().trim().max(1000).optional(),
});

export const adminCancelBookingInputSchema = z.object({
  bookingId: bookingIdSchema,
  reason: z.string().trim().min(3).max(1000),
});
