"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/modules/auth/guards";
import { createBookingForCustomer } from "@/modules/booking/create-booking";
import { bookingActionFormSchema } from "@/modules/booking/schema";

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
