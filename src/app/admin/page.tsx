import { signOutAdmin } from "@/modules/auth/actions";
import { requireAdmin } from "@/modules/auth/guards";
import Link from "next/link";

export default async function AdminDashboardPage() {
  await requireAdmin();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard admin</h1>
      <p className="mt-2 text-muted-foreground">Admin aktif.</p>
      <Link
        className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        href="/admin/packages"
      >
        Kelola package
      </Link>
      <Link
        className="ml-3 inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-secondary"
        href="/admin/schedule"
      >
        Kelola jadwal
      </Link>
      <Link
        className="ml-3 inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-secondary"
        href="/admin/booths"
      >
        Photobooth
      </Link>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary"
          href="/admin/bookings"
        >
          Booking
        </Link>
        <Link
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary"
          href="/admin/calendar"
        >
          Kalender
        </Link>
        <Link
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary"
          href="/admin/customers"
        >
          Customer
        </Link>
      </div>
      <form action={signOutAdmin} className="mt-6">
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
