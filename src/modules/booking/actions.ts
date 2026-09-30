"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/modules/auth/guards";
import { cancelMyBooking } from "@/modules/booking/cancel-booking";
import { createBookingForCustomer } from "@/modules/booking/create-booking";
import {
  bookingActionFormSchema,
  cancelMyBookingInputSchema,
} from "@/modules/booking/schema";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function createBookingAction(formData: FormData): Promise<never> {
  const parsed = bookingActionFormSchema.safeParse({
    packageId: value(formData, "packageId"),
    startAt: value(formData, "startAt"),
    customerNote: value(formData, "customerNote") || undefined,
    packageSlug: value(formData, "packageSlug"),
  });
  if (!parsed.success) redirect("/packages");

  const { userId } = await requireCustomer(
    `/packages/${parsed.data.packageSlug}/book?startAt=${encodeURIComponent(parsed.data.startAt)}`,
  );
  const result = await createBookingForCustomer(userId, {
    packageId: parsed.data.packageId,
    startAt: new Date(parsed.data.startAt),
    customerNote: parsed.data.customerNote,
  });

  if (result.ok) {
    revalidatePath("/dashboard");
    redirect(`/dashboard/bookings/${result.booking.id}`);
  }

  const error = result.code.toLowerCase();
  const startAt = encodeURIComponent(parsed.data.startAt);
  redirect(
    `/packages/${parsed.data.packageSlug}/book?startAt=${startAt}&error=${error}`,
  );
}

export async function cancelMyBookingAction(
  formData: FormData,
): Promise<never> {
  const parsed = cancelMyBookingInputSchema.safeParse({
    bookingId: formData.get("bookingId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success)
    redirect("/dashboard/bookings?cancelError=invalid_input");

  const { userId } = await requireCustomer();
  const result = await cancelMyBooking(
    userId,
    parsed.data.bookingId,
    parsed.data.reason,
  );
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/bookings");
  revalidatePath(`/dashboard/bookings/${parsed.data.bookingId}`);

  if (!result.ok) {
    redirect(
      `/dashboard/bookings/${parsed.data.bookingId}?cancelError=${result.code.toLowerCase()}`,
    );
  }

  const parameters = new URLSearchParams({ cancelled: "1" });
  if (result.providerCancelFailed) parameters.set("providerCancel", "failed");
  redirect(
    `/dashboard/bookings/${parsed.data.bookingId}?${parameters.toString()}`,
  );
}
