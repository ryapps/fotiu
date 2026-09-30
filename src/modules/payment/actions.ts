"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/modules/auth/guards";
import { createPaymentForCustomer } from "@/modules/payment/create-payment";
import { bookingIdSchema } from "@/modules/booking/schema";

export async function createPaymentAction(formData: FormData): Promise<never> {
  const bookingId = bookingIdSchema.safeParse(formData.get("bookingId"));
  if (!bookingId.success) redirect("/dashboard");
  const { userId } = await requireCustomer();
  const result = await createPaymentForCustomer(userId, bookingId.data);
  revalidatePath(`/dashboard/bookings/${bookingId.data}`);
  if (result.ok) redirect(`/dashboard/bookings/${bookingId.data}`);

  const paymentError = result.code.toLowerCase();
  redirect(
    `/dashboard/bookings/${bookingId.data}?paymentError=${paymentError}`,
  );
}
