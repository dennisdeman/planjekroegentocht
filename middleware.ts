import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login", "/register", "/invite", "/verify", "/forgot-password", "/reset-password",
  "/api/auth", "/api/contact", "/api/payments/webhook", "/api/cron",
  "/api/live",
  "/live",
  "/functies", "/hoe-het-werkt", "/voor-wie", "/prijzen", "/faq", "/blog", "/over-ons", "/contact",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (pathname === "/" || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Check for NextAuth session token cookie
  const sessionToken =
    request.cookies.get("__Secure-authjs.session-token") ??
    request.cookies.get("authjs.session-token");

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|favicon\\.ico|robots\\.txt|.*\\.).*)",
  ],
};
