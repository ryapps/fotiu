import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { signOutCustomer } from "@/modules/auth/actions";
import { requireCustomer } from "@/modules/auth/guards";

export default async function DashboardPage() {
  const { userId } = await requireCustomer();
  const bookings = await prisma.booking.findMany({
    where: { userId },
    select: {
      id: true,
      code: true,
      packageNameSnapshot: true,
      startAt: true,
      status: true,
    },
    orderBy: { startAt: "desc" },
    take: 20,
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Dashboard customer
      </h1>
      <p className="mt-2 text-muted-foreground">Booking terbaru Anda.</p>
      <ul className="mt-6 space-y-3">
        {bookings.length ? (
          bookings.map((booking) => (
            <li key={booking.id} className="rounded-lg border p-4">
              <Link
                href={`/dashboard/bookings/${booking.id}`}
                className="font-medium text-primary hover:underline"
              >
                {booking.packageNameSnapshot} · {booking.code}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {booking.status.replaceAll("_", " ")} ·{" "}
                {booking.startAt.toLocaleString("id-ID", {
                  timeZone: "Asia/Jakarta",
                })}
              </p>
            </li>
          ))
        ) : (
          <li className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Belum ada booking.{" "}
            <Link href="/packages" className="text-primary hover:underline">
              Lihat package
            </Link>
          </li>
        )}
      </ul>
      <form action={signOutCustomer} className="mt-6">
        <button
          className="rounded-md border px-4 py-2 text-sm font-medium"
          type="submit"
        >
          Keluar
        </button>
      </form>
    </main>
  );
}
