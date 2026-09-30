import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/modules/booking/cron-auth";

describe("cron authorization", () => {
  it("requires an exact bearer secret", () => {
    expect(isAuthorizedCron("Bearer secret-value", "secret-value")).toBe(true);
    expect(isAuthorizedCron("Bearer wrong", "secret-value")).toBe(false);
    expect(isAuthorizedCron(null, "secret-value")).toBe(false);
    expect(isAuthorizedCron("secret-value", "secret-value")).toBe(false);
  });
});
