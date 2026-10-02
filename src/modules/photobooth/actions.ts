"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/modules/auth/guards";
import {
  assignBooth,
  checkInBooking,
  completeBookingAsAdmin,
  startPhotoSession,
  setBoothMaintenance,
} from "@/modules/photobooth/operations";

const bookingActionSchema = z.object({
  bookingId: z.string().trim().min(1).max(64),
});
const assignmentSchema = bookingActionSchema.extend({
  boothId: z.string().trim().min(1).max(64),
});
const sessionSchema = z.object({
  photoSessionId: z.string().trim().min(1).max(64),
  bookingId: z.string().trim().min(1).max(64),
});
const completeBookingSchema = z.discriminatedUnion("mode", [
  z.object({
    bookingId: z.string().trim().min(1).max(64),
    mode: z.literal("session"),
  }),
  z.object({
    bookingId: z.string().trim().min(1).max(64),
    mode: z.literal("manual"),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export async function checkInBookingAction(formData: FormData): Promise<never> {
  const admin = await requireAdmin();
  const parsed = bookingActionSchema.safeParse({
    bookingId: formData.get("bookingId"),
  });
  if (!parsed.success) redirect("/admin/bookings?error=invalid_input");
  const result = await checkInBooking({
    bookingId: parsed.data.bookingId,
    adminId: admin.adminId,
  });
  const path = `/admin/bookings/${encodeURIComponent(parsed.data.bookingId)}`;
  revalidatePath(path);
  if (!result.ok)
    redirect(`${path}?error=checkin_${result.code.toLowerCase()}`);
  redirect(`${path}?checkedIn=1`);
}

export async function assignBoothAction(formData: FormData): Promise<never> {
  await requireAdmin();
  const parsed = assignmentSchema.safeParse({
    bookingId: formData.get("bookingId"),
    boothId: formData.get("boothId"),
  });
  const rawId = formData.get("bookingId");
  const path =
    typeof rawId === "string" && rawId.length <= 64
      ? `/admin/bookings/${encodeURIComponent(rawId)}`
      : "/admin/bookings";
  if (!parsed.success) redirect(`${path}?error=assignment_invalid_input`);
  const result = await assignBooth(parsed.data);
  revalidatePath(path);
  revalidatePath("/admin/booths");
  if (!result.ok)
    redirect(`${path}?error=assignment_${result.code.toLowerCase()}`);
  redirect(`${path}?assigned=1`);
}

export async function setBoothMaintenanceAction(
  formData: FormData,
): Promise<never> {
  await requireAdmin();
  const parsed = z
    .object({
      boothId: z.string().trim().min(1).max(64),
      enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
    })
    .safeParse({
      boothId: formData.get("boothId"),
      enabled: formData.get("enabled"),
    });
  if (!parsed.success) redirect("/admin/booths?error=invalid_input");
  const result = await setBoothMaintenance(parsed.data);
  revalidatePath("/admin/booths");
  if (!result.ok)
    redirect(`/admin/booths?error=maintenance_${result.code.toLowerCase()}`);
  redirect("/admin/booths?maintenance=updated");
}

export async function startPhotoSessionAction(
  formData: FormData,
): Promise<never> {
  await requireAdmin();
  const parsed = sessionSchema.safeParse({
    photoSessionId: formData.get("photoSessionId"),
    bookingId: formData.get("bookingId"),
  });
  const rawId = formData.get("bookingId");
  const path =
    typeof rawId === "string" && rawId.length <= 64
      ? `/admin/bookings/${encodeURIComponent(rawId)}`
      : "/admin/bookings";
  if (!parsed.success) redirect(`${path}?error=start_invalid_input`);
  const result = await startPhotoSession(parsed.data);
  revalidatePath(path);
  revalidatePath("/admin/booths");
  if (!result.ok) redirect(`${path}?error=start_${result.code.toLowerCase()}`);
  const ownerPath = result.bookingId
    ? `/admin/bookings/${encodeURIComponent(result.bookingId)}`
    : path;
  redirect(
    `${ownerPath}?started=${result.commandStatus === "MANUAL" ? "manual" : "1"}`,
  );
}

export async function completeBookingPhotoboothAction(
  formData: FormData,
): Promise<never> {
  const admin = await requireAdmin();
  const parsed = completeBookingSchema.safeParse({
    bookingId: formData.get("bookingId"),
    mode: formData.get("mode"),
    reason: formData.get("reason"),
  });
  const rawId = formData.get("bookingId");
  const path =
    typeof rawId === "string" && rawId.length <= 64
      ? `/admin/bookings/${encodeURIComponent(rawId)}`
      : "/admin/bookings";
  if (!parsed.success) redirect(`${path}?error=complete_invalid_input`);
  const result = await completeBookingAsAdmin({
    bookingId: parsed.data.bookingId,
    adminId: admin.adminId,
    ...(parsed.data.mode === "manual" ? { reason: parsed.data.reason } : {}),
  });
  revalidatePath(path);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  if (!result.ok)
    redirect(`${path}?error=complete_${result.code.toLowerCase()}`);
  redirect(`${path}?completed=${parsed.data.mode}`);
}
