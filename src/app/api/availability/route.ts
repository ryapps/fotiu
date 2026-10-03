import { NextResponse } from "next/server";
import { z } from "zod";
import { getPackageAvailability } from "@/modules/scheduling/availability-service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  packageId: z.string().trim().min(1).max(64),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((date) => {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === date
      );
    }),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    packageId: searchParams.get("packageId"),
    date: searchParams.get("date"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION",
        message: "Pilih paket dan tanggal yang valid.",
      },
      { status: 400 },
    );
  }

  const availability = await getPackageAvailability(
    parsed.data.packageId,
    parsed.data.date,
  );
  if (!availability) {
    return NextResponse.json(
      { ok: false, code: "NOT_FOUND", message: "Package tidak ditemukan." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, ...availability });
}
