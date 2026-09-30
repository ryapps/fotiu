import { describe, expect, it } from "vitest";
import { createBookingInputSchema } from "@/modules/booking/schema";

describe("create booking input", () => {
  it("accepts only booking fields and strips client supplied authority and price fields", () => {
    const parsed = createBookingInputSchema.parse({
      packageId: "package_123",
      startAt: "2026-10-15T03:00:00.000Z",
      userId: "attacker",
      endAt: "2030-01-01T00:00:00Z",
      price: 1,
    });
    expect(parsed).toEqual({
      packageId: "package_123",
      startAt: "2026-10-15T03:00:00.000Z",
    });
  });

  it("rejects timestamps without an explicit timezone", () => {
    expect(
      createBookingInputSchema.safeParse({
        packageId: "package_123",
        startAt: "2026-10-15T10:00:00",
      }).success,
    ).toBe(false);
  });
});
