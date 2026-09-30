import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1));
  const pageSize = 25;
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [customers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (target: number) =>
    `/admin/customers?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(target) }).toString()}`;
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
      <Link
        className="text-sm text-muted-foreground hover:underline"
        href="/admin"
      >
        ← Dashboard admin
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Customer</h1>
      <form className="mt-5 flex gap-3">
        <label className="sr-only" htmlFor="customer-search">
          Cari customer
        </label>
        <input
          id="customer-search"
          className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
          name="q"
          maxLength={100}
          defaultValue={query}
          placeholder="Cari nama atau email"
        />
        <button
          className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          type="submit"
        >
          Cari
        </button>
      </form>
      {customers.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Tidak ada customer yang cocok.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-3">Nama</th>
                <th className="p-3">Email</th>
                <th className="p-3">Telepon</th>
                <th className="p-3">Booking</th>
                <th className="p-3">Terdaftar</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="p-3 font-medium">{customer.name}</td>
                  <td className="p-3">{customer.email}</td>
                  <td className="p-3">{customer.phone ?? "—"}</td>
                  <td className="p-3">{customer._count.bookings}</td>
                  <td className="p-3">
                    {new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "medium",
                    }).format(customer.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total} customer · halaman {page} dari {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link className="rounded-md border px-3 py-2" href={href(page - 1)}>
              Sebelumnya
            </Link>
          )}
          {page < pages && (
            <Link className="rounded-md border px-3 py-2" href={href(page + 1)}>
              Berikutnya
            </Link>
          )}
        </div>
      </nav>
    </main>
  );
}
