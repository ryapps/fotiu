import { signOutCustomer } from "@/modules/auth/actions";
import { requireCustomer } from "@/modules/auth/guards";

export default async function DashboardPage() {
  await requireCustomer();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Dashboard customer
      </h1>
      <p className="mt-2 text-muted-foreground">
        Sesi customer terautentikasi.
      </p>
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
