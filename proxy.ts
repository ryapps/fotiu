import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl;
  const user = request.auth?.user;

  if (pathname === "/admin/login") return NextResponse.next();

  if (pathname.startsWith("/dashboard")) {
    if (!user) {
      const loginUrl = new URL("/login", request.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }

    if (user.role !== "CUSTOMER") {
      return NextResponse.redirect(new URL("/admin", request.nextUrl.origin));
    }
  }

  if (pathname.startsWith("/admin")) {
    if (user?.role === "CUSTOMER") {
      return NextResponse.redirect(
        new URL("/dashboard", request.nextUrl.origin),
      );
    }

    if (!user) {
      const loginUrl = new URL("/admin/login", request.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
