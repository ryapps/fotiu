import { describe, expect, it } from "vitest";
import { packageInputSchema } from "@/modules/packages/schema";

const validPackage = {
  slug: "portrait-basic",
  name: "Portrait Basic",
  description: "Sesi portrait untuk satu orang.",
  price: 150_000,
  durationMinutes: 45,
  bufferMinutes: 15,
  coverImageUrl: "",
  sortOrder: 1,
};

describe("packageInputSchema", () => {
  it("accepts a valid package", () => {
    expect(packageInputSchema.safeParse(validPackage).success).toBe(true);
  });

  it.each([
    { price: -1 },
    { price: 1.5 },
    { durationMinutes: 0 },
    { durationMinutes: 15.5 },
    { bufferMinutes: -1 },
    { sortOrder: -1 },
    { slug: "Portrait Basic" },
    { coverImageUrl: "javascript:alert(1)" },
  ])("rejects invalid package fields: %o", (fields) => {
    expect(
      packageInputSchema.safeParse({ ...validPackage, ...fields }).success,
    ).toBe(false);
  });
});
