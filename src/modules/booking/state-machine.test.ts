import { describe, expect, it } from "vitest";
import { canTransitionBooking } from "@/modules/booking/state-machine";

describe("booking state machine", () => {
  it("allows only documented forward transitions", () => {
    expect(canTransitionBooking("WAITING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransitionBooking("WAITING_PAYMENT", "EXPIRED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "COMPLETED")).toBe(true);
    expect(canTransitionBooking("EXPIRED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("COMPLETED", "CANCELLED")).toBe(false);
  });
});
