import { z } from "zod";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const operatingHoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      isOpen: z.boolean(),
      openTime: timeSchema,
      closeTime: timeSchema,
    }),
  )
  .length(7)
  .superRefine((days, context) => {
    const weekdayValues = new Set(days.map((day) => day.weekday));
    if (weekdayValues.size !== 7) {
      context.addIssue({
        code: "custom",
        message: "Setiap hari harus diisi tepat satu kali.",
      });
    }

    for (const [index, day] of days.entries()) {
      if (day.closeTime <= day.openTime) {
        context.addIssue({
          code: "custom",
          path: [index, "closeTime"],
          message: "Jam tutup harus sesudah jam buka.",
        });
      }
    }
  });

export const scheduleBlockSchema = z.object({
  startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  endAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  reason: z.string().trim().min(1, "Alasan wajib diisi.").max(200),
});

export const scheduleBlockIdSchema = z.string().trim().min(1).max(64);
