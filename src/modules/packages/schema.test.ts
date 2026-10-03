import { describe, expect, it } from "vitest";
import {
  packageActiveActionSchema,
  packageIdSchema,
  packageInputSchema,
} from "@/modules/packages/schema";

const validPackage = {
  slug: "portrait-basic",
  name: "Portrait Basic",
  description: "Sesi portrait untuk satu orang.",
  price: 30_000,
  durationMinutes: 10,
  coverImageUrl: "",
  sortOrder: 1,
};

describe("packageInputSchema", () => {
  it("accepts a valid package", () => {
    expect(packageInputSchema.safeParse(validPackage).success).toBe(true);
  });

  it.each([
    { price: 19_999 },
    { price: 40_001 },
    { price: 20_000.5 },
    { durationMinutes: 4 },
    { durationMinutes: 61 },
    { sortOrder: -1 },
    { slug: "Portrait Basic" },
    { coverImageUrl: "javascript:alert(1)" },
  ])("rejects invalid package fields: %o", (fields) => {
    expect(
      packageInputSchema.safeParse({ ...validPackage, ...fields }).success,
    ).toBe(false);
  });
});

describe("package admin action schemas", () => {
  it("parses bounded IDs and package active form values", () => {
    expect(packageIdSchema.safeParse("package-id").success).toBe(true);
    expect(packageIdSchema.safeParse("x".repeat(65)).success).toBe(false);
    expect(
      packageActiveActionSchema.parse({ id: "package-id", isActive: "false" }),
    ).toEqual({ id: "package-id", isActive: false });
  });

  it("rejects malformed active form values", () => {
    expect(
      packageActiveActionSchema.safeParse({ id: "package-id", isActive: "yes" })
        .success,
    ).toBe(false);
  });
});
