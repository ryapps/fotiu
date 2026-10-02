"use client";

import { signOutAdmin } from "@/modules/auth/actions";
import {
  CalendarDays,
  Camera,
  Clock3,
  Images,
  LayoutDashboard,
  LogOut,
  Package,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Booking", href: "/admin/bookings", icon: CalendarDays },
  { label: "Kalender", href: "/admin/calendar", icon: Clock3 },
  { label: "Customer", href: "/admin/customers", icon: UsersRound },
  { label: "Gallery", href: "/admin/gallery", icon: Images },
  { label: "Package", href: "/admin/packages", icon: Package },
  { label: "Jadwal", href: "/admin/schedule", icon: Clock3 },
  { label: "Photobooth", href: "/admin/booths", icon: Camera },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") return children;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:gap-7 lg:px-7 lg:py-7">
      <aside className="flex shrink-0 flex-col rounded-2xl border border-primary/10 bg-white/90 p-3 shadow-[0_16px_42px_rgba(37,74,138,0.06)] lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-60 lg:p-4">
        <Link href="/admin" className="hidden px-3 py-4 lg:block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Fotiu Studio
          </span>
          <span className="mt-1 block text-lg font-semibold text-foreground">
            Admin panel
          </span>
        </Link>

        <nav
          aria-label="Navigasi admin"
          className="flex gap-1 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-visible"
        >
          {navigation.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/admin"
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                }`}
              >
                <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                {label}
              </Link>
            );
          })}
        </nav>

        <form
          action={signOutAdmin}
          className="mt-2 border-t border-border/80 pt-2 lg:mt-auto lg:pt-3"
        >
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive"
            type="submit"
          >
            <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
            Keluar
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
