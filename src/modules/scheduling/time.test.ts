import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  getLocalDate,
  localDateTimeToUtc,
  localDayBoundsUtc,
} from "@/modules/scheduling/time";

describe("studio timezone helpers", () => {
  it("converts local studio times to UTC", () => {
    expect(
      localDateTimeToUtc("2026-01-02T09:00", "Asia/Jakarta").toISOString(),
    ).toBe("2026-01-02T02:00:00.000Z");
  });

  it("formats an instant as the studio calendar date", () => {
    expect(
      getLocalDate(new Date("2025-12-31T18:00:00.000Z"), "Asia/Jakarta"),
    ).toBe("2026-01-01");
  });

  it("computes local day bounds across month and year edges", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(localDayBoundsUtc("2026-01-01", "Asia/Jakarta")).toEqual({
      start: new Date("2025-12-31T17:00:00.000Z"),
      end: new Date("2026-01-01T17:00:00.000Z"),
    });
  });

  it("rejects invalid dates and local times skipped by timezone transitions", () => {
    expect(() =>
      localDateTimeToUtc("2026-02-30T09:00", "Asia/Jakarta"),
    ).toThrow();
    expect(() =>
      localDateTimeToUtc("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
  });
});
