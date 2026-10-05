import { describe, expect, it, vi } from "vitest";
import { publicFramePolicy } from "./frame-policy";

vi.mock("./env", () => ({}));

describe("portfolio iframe policy", () => {
  it("denies embedding when no origins are configured", () => {
    expect(publicFramePolicy()).toBe("frame-ancestors 'none';");
    expect(publicFramePolicy(" , ")).toBe("frame-ancestors 'none';");
  });

  it("allows only the configured exact origins and normalizes duplicates", () => {
    expect(
      publicFramePolicy(
        "https://studio.example/, https://studio.example, http://localhost:3000",
      ),
    ).toBe("frame-ancestors https://studio.example http://localhost:3000;");
  });

  it.each([
    "*",
    "https://*.example.com",
    "https://example.com; script-src *",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?query=1",
    "https://example.com#fragment",
    "http://example.com",
    "javascript:alert(1)",
  ])("rejects an unsafe origin: %s", (origin) => {
    expect(() => publicFramePolicy(origin)).toThrow();
  });

  it("allows only public routes, keeping login and booking routes protected", async () => {
    const { default: config } = await import("../../next.config");
    const rules = await config.headers!();
    const publicRules = rules.filter((rule) =>
      ["/", "/gallery", "/packages", "/packages/:slug"].includes(rule.source),
    );
    expect(publicRules).toHaveLength(4);
    for (const source of [
      "/admin/:path*",
      "/dashboard/:path*",
      "/login",
      "/api/:path*",
      "/packages/:slug/book",
    ]) {
      expect(
        rules.find((rule) => rule.source === source)?.headers,
      ).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    }
    expect(rules[0].headers).toContainEqual({
      key: "Content-Security-Policy",
      value: "frame-ancestors 'none';",
    });
  });
});
