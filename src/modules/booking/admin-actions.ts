"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/auth/guards";
import {
  cancelBookingAsAdmin,
  markPaymentRefundedAsAdmin,
  rescheduleBookingAsAdmin,
} from "@/modules/booking/admin-operations";
import {
  adminCancelBookingInputSchema,
  adminRescheduleBookingInputSchema,
  adminMarkRefundedInputSchema,
} from "@/modules/booking/schema";

export async function cancelBookingAdminAction(
  formData: FormData,
): Promise<never> {
  await requireAdmin();
  const parsed = adminCancelBookingInputSchema.safeParse({
    bookingId: formData.get("bookingId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect("/admin/bookings?error=invalid_input");
  const result = await cancelBookingAsAdmin(
    parsed.data.bookingId,
    parsed.data.reason,
  );
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${parsed.data.bookingId}`);
  revalidatePath("/admin/calendar");
  if (!result.ok)
    redirect(
      `/admin/bookings/${parsed.data.bookingId}?error=${result.code.toLowerCase()}`,
    );
  const query = new URLSearchParams({ cancelled: "1" });
  if (result.needsRefund) query.set("refund", "required");
  if (result.providerCancelFailed) query.set("providerCancel", "failed");
  if (result.sessionStillActive) query.set("session", "continues");
  redirect(`/admin/bookings/${parsed.data.bookingId}?${query.toString()}`);
}

export async function rescheduleBookingAdminAction(
  formData: FormData,
): Promise<never> {
  await requireAdmin();
  const parsed = adminRescheduleBookingInputSchema.safeParse({
    bookingId: formData.get("bookingId"),
    newStartAt: formData.get("newStartAt"),
    expectedStartAt: formData.get("expectedStartAt"),
  });
  const rawId = formData.get("bookingId");
  const detailPath =
    typeof rawId === "string" && rawId.length <= 64
      ? `/admin/bookings/${encodeURIComponent(rawId)}`
      : "/admin/bookings";
  if (!parsed.success) redirect(`${detailPath}?error=invalid_reschedule`);
  const result = await rescheduleBookingAsAdmin({
    bookingId: parsed.data.bookingId,
    newStartAt: parsed.data.newStartAt,
    expectedStartAt: new Date(parsed.data.expectedStartAt),
  });
  revalidatePath("/admin/bookings");
  revalidatePath(detailPath);
  revalidatePath("/admin/calendar");
  if (!result.ok) redirect(`${detailPath}?error=${result.code.toLowerCase()}`);
  redirect(`${detailPath}?rescheduled=1`);
}

export async function markPaymentRefundedAdminAction(
  formData: FormData,
): Promise<never> {
  const { adminId } = await requireAdmin();
  const parsed = adminMarkRefundedInputSchema.safeParse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason"),
  });
  const rawId = formData.get("bookingId");
  const detailPath =
    typeof rawId === "string" && rawId.length <= 64
      ? `/admin/bookings/${encodeURIComponent(rawId)}`
      : "/admin/bookings";
  if (!parsed.success) redirect(`${detailPath}?error=refund_invalid_input`);
  const result = await markPaymentRefundedAsAdmin({
    ...parsed.data,
    adminId,
  });
  revalidatePath("/admin/bookings");
  revalidatePath(detailPath);
  if (!result.ok) redirect(`${detailPath}?error=refund_${result.code.toLowerCase()}`);
  redirect(`${detailPath}?refunded=1`);
}
