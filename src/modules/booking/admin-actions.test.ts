import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdmin,
  markPaymentRefundedAsAdmin,
  rescheduleBookingAsAdmin,
  redirect,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  markPaymentRefundedAsAdmin: vi.fn(),
  rescheduleBookingAsAdmin: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/modules/auth/guards", () => ({ requireAdmin }));
vi.mock("@/modules/booking/admin-operations", () => ({
  cancelBookingAsAdmin: vi.fn(),
  markPaymentRefundedAsAdmin,
  rescheduleBookingAsAdmin,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

import {
  markPaymentRefundedAdminAction,
  rescheduleBookingAdminAction,
} from "@/modules/booking/admin-actions";

describe("manual refund admin action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ adminId: "admin-123" });
    markPaymentRefundedAsAdmin.mockResolvedValue({ ok: true });
  });

  it("requires an admin before processing a refund request", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));
    const form = new FormData();
    form.set("paymentId", "payment-123");
    form.set("bookingId", "booking-123");
    form.set("reason", "Refund transfer reference");

    await expect(markPaymentRefundedAdminAction(form)).rejects.toThrow(
      "Unauthorized",
    );
    expect(markPaymentRefundedAsAdmin).not.toHaveBeenCalled();
  });

  it("uses the admin from the server session and validates the reason", async () => {
    const form = new FormData();
    form.set("paymentId", "payment-123");
    form.set("bookingId", "booking-123");
    form.set("reason", " Refund reference RF-001 ");

    await expect(markPaymentRefundedAdminAction(form)).rejects.toThrow(
      "redirect:/admin/bookings/booking-123?refunded=1",
    );
    expect(markPaymentRefundedAsAdmin).toHaveBeenCalledWith({
      paymentId: "payment-123",
      reason: "Refund reference RF-001",
      adminId: "admin-123",
    });
  });

  it("does not permit a customer to reschedule by invoking the server action", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));
    const form = new FormData();
    form.set("bookingId", "booking-123");
    form.set("newStartAt", "2026-10-30T13:00");
    form.set("expectedStartAt", "2026-10-29T06:00:00.000Z");

    await expect(rescheduleBookingAdminAction(form)).rejects.toThrow(
      "Unauthorized",
    );
    expect(rescheduleBookingAsAdmin).not.toHaveBeenCalled();
  });
});
