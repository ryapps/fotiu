import { describe, expect, it } from "vitest";
import { getSafeCallbackPath } from "@/modules/auth/callback-url";

const baseUrl = "http://localhost:3000";

describe("getSafeCallbackPath", () => {
  it("keeps internal relative paths and query strings", () => {
    expect(
      getSafeCallbackPath("/dashboard/bookings?filter=upcoming", baseUrl),
    ).toBe("/dashboard/bookings?filter=upcoming");
  });

  it("keeps absolute URLs only when their origin matches the app", () => {
    expect(
      getSafeCallbackPath("http://localhost:3000/admin?tab=bookings", baseUrl),
    ).toBe("/admin?tab=bookings");
  });

  it("falls back for external origins and protocol-relative URLs", () => {
    expect(getSafeCallbackPath("https://evil.example/path", baseUrl)).toBe(
      "/dashboard",
    );
    expect(getSafeCallbackPath("//evil.example/path", baseUrl)).toBe(
      "/dashboard",
    );
  });

  it("falls back for malformed callback URLs", () => {
    expect(getSafeCallbackPath("http://[", baseUrl, "/admin")).toBe("/admin");
  });
});
