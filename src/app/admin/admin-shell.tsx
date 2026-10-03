"use client";

import { Button } from "@/components/ui/button";
import { signOutAdmin } from "@/modules/auth/actions";
import {
  CalendarDays,
  Camera,
  Clock3,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigation = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Booking", href: "/admin/bookings", icon: CalendarDays },
  { label: "Kalender", href: "/admin/calendar", icon: Clock3 },
  { label: "Customer", href: "/admin/customers", icon: UsersRound },
  { label: "Galeri", href: "/admin/gallery", icon: Images },
  { label: "Paket", href: "/admin/packages", icon: Package },
  { label: "Jadwal", href: "/admin/schedule", icon: Clock3 },
  { label: "Photobooth", href: "/admin/booths", icon: Camera },
];

function NavigationLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return navigation.map(({ label, href, icon: Icon }) => {
    const active =
      href === "/admin"
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);

    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`inline-flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
        }`}
      >
        <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        {label}
      </Link>
    );
  });
}

function LogoutControl() {
  return (
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
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (pathname === "/admin/login") return children;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:gap-7 lg:px-7 lg:py-7">
      <div className="rounded-2xl border border-primary/10 bg-white/90 p-3 shadow-[0_16px_42px_rgba(37,74,138,0.06)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/admin"
            onClick={() => setMobileMenuOpen(false)}
            className="px-2 py-1"
          >
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Fotiu Studio
            </span>
            <span className="block text-lg font-semibold text-foreground">
              Admin panel
            </span>
          </Link>
          <Button
            variant="outline"
            size="icon-lg"
            className="h-11 w-11"
            type="button"
            aria-label={mobileMenuOpen ? "Tutup menu admin" : "Buka menu admin"}
            aria-controls="admin-mobile-menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </Button>
        </div>
        <div
          id="admin-mobile-menu"
          className={
            mobileMenuOpen ? "mt-3 border-t border-border/80 pt-3" : "hidden"
          }
        >
          <nav aria-label="Navigasi admin" className="grid gap-1">
            <NavigationLinks
              pathname={pathname}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </nav>
          <LogoutControl />
        </div>
      </div>

      <aside className="hidden shrink-0 flex-col rounded-2xl border border-primary/10 bg-white/90 p-4 shadow-[0_16px_42px_rgba(37,74,138,0.06)] lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)] lg:w-60">
        <Link href="/admin" className="px-3 py-4">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Fotiu Studio
          </span>
          <span className="mt-1 block text-lg font-semibold text-foreground">
            Admin panel
          </span>
        </Link>

        <nav aria-label="Navigasi admin" className="flex flex-1 flex-col gap-1">
          <NavigationLinks pathname={pathname} />
        </nav>

        <LogoutControl />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
