"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/auth/guards";
import { cancelBookingAsAdmin } from "@/modules/booking/admin-operations";
import { adminCancelBookingInputSchema } from "@/modules/booking/schema";

export async function cancelBookingAdminAction(formData: FormData): Promise<never> {
  await requireAdmin();
  const parsed = adminCancelBookingInputSchema.safeParse({ bookingId: formData.get("bookingId"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin/bookings?error=invalid_input");
  const result = await cancelBookingAsAdmin(parsed.data.bookingId, parsed.data.reason);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${parsed.data.bookingId}`);
  revalidatePath("/admin/calendar");
  if (!result.ok) redirect(`/admin/bookings/${parsed.data.bookingId}?error=${result.code.toLowerCase()}`);
  const query = new URLSearchParams({ cancelled: "1" });
  if (result.needsRefund) query.set("refund", "required");
  if (result.providerCancelFailed) query.set("providerCancel", "failed");
  redirect(`/admin/bookings/${parsed.data.bookingId}?${query.toString()}`);
}
