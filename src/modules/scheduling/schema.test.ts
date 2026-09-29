import { describe, expect, it } from "vitest";
import {
  operatingHoursSchema,
  scheduleBlockSchema,
} from "@/modules/scheduling/schema";

const hours = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  isOpen: weekday !== 0,
  openTime: "09:00",
  closeTime: "17:00",
}));

describe("scheduling input schemas", () => {
  it("accepts exactly one valid operating-hours row per weekday", () => {
    expect(operatingHoursSchema.safeParse(hours).success).toBe(true);
  });

  it("rejects missing, duplicate, malformed, and reversed operating hours", () => {
    expect(operatingHoursSchema.safeParse(hours.slice(0, 6)).success).toBe(
      false,
    );
    expect(
      operatingHoursSchema.safeParse([
        ...hours.slice(0, 6),
        { ...hours[6], weekday: 5 },
      ]).success,
    ).toBe(false);
    expect(
      operatingHoursSchema.safeParse(
        hours.map((day) =>
          day.weekday === 2 ? { ...day, openTime: "9am" } : day,
        ),
      ).success,
    ).toBe(false);
    expect(
      operatingHoursSchema.safeParse(
        hours.map((day) =>
          day.weekday === 3 ? { ...day, closeTime: "08:30" } : day,
        ),
      ).success,
    ).toBe(false);
  });

  it("requires a valid block interval input and reason", () => {
    expect(
      scheduleBlockSchema.safeParse({
        startAt: "2026-09-30T10:00",
        endAt: "2026-09-30T11:00",
        reason: "Studio maintenance",
      }).success,
    ).toBe(true);
    expect(
      scheduleBlockSchema.safeParse({
        startAt: "bad",
        endAt: "2026-09-30T11:00",
        reason: "",
      }).success,
    ).toBe(false);
  });
});
