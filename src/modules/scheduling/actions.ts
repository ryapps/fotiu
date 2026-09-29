"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { localDateTimeToUtc } from "@/modules/scheduling/time";
import {
  operatingHoursSchema,
  scheduleBlockIdSchema,
  scheduleBlockSchema,
} from "@/modules/scheduling/schema";

const weekdays = 7;

export async function saveOperatingHours(formData: FormData) {
  await requireAdmin();

  const parsed = operatingHoursSchema.safeParse(
    Array.from({ length: weekdays }, (_, weekday) => ({
      weekday,
      isOpen:
        formData.get(`day-${weekday}-isOpen`) === "open"
          ? true
          : formData.get(`day-${weekday}-isOpen`) === "closed"
            ? false
            : null,
      openTime: formData.get(`day-${weekday}-openTime`),
      closeTime: formData.get(`day-${weekday}-closeTime`),
    })),
  );

  if (!parsed.success) redirect("/admin/schedule?error=invalid_hours");

  await prisma.$transaction(
    parsed.data.map(({ weekday, ...data }) =>
      prisma.operatingHour.upsert({
        where: { weekday },
        create: { weekday, ...data },
        update: data,
      }),
    ),
  );

  revalidatePath("/admin/schedule");
  redirect("/admin/schedule?saved=hours");
}

export async function createScheduleBlock(formData: FormData) {
  const { adminId } = await requireAdmin();
  const parsed = scheduleBlockSchema.safeParse({
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect("/admin/schedule?error=invalid_block");

  let startAt: Date;
  let endAt: Date;
  try {
    startAt = localDateTimeToUtc(parsed.data.startAt, env.STUDIO_TIMEZONE);
    endAt = localDateTimeToUtc(parsed.data.endAt, env.STUDIO_TIMEZONE);
  } catch {
    redirect("/admin/schedule?error=invalid_block");
  }

  if (endAt <= startAt) redirect("/admin/schedule?error=invalid_block");

  const block = await prisma.scheduleBlock.create({
    data: {
      startAt,
      endAt,
      reason: parsed.data.reason,
      createdByAdminId: adminId,
    },
    select: { id: true },
  });

  revalidatePath("/admin/schedule");
  const params = new URLSearchParams({ block: block.id });
  redirect(`/admin/schedule?${params.toString()}`);
}

export async function deleteScheduleBlock(formData: FormData) {
  await requireAdmin();
  const parsedId = scheduleBlockIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) redirect("/admin/schedule?error=invalid_block");

  try {
    await prisma.scheduleBlock.delete({ where: { id: parsedId.data } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      redirect("/admin/schedule?error=not_found");
    }
    throw error;
  }

  revalidatePath("/admin/schedule");
  redirect("/admin/schedule?saved=block_deleted");
}
