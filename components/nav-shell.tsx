"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import type { ReactNode } from "react";
import { OrgSwitcher } from "./org-switcher";
import { usePlanState } from "@lib/use-plan-state";

interface NavShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/configurator", label: "Configurator" },
  { href: "/planner", label: "Planner" },
  { href: "/kroegentochten", label: "Kroegentochten" },
  { href: "/settings/spellen", label: "Spellenbibliotheek" },
  { href: "/upgrade", label: "Upgraden" },
  { href: "/help", label: "Help" },
];

const AUTH_PATHS = ["/login", "/register", "/invite", "/verify", "/forgot-password", "/reset-password"];

export function NavShell({ children }: NavShellProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const planState = usePlanState();
  const [menuOpen, setMenuOpen] = useState(false);
  const proBadgeLabel = planState.plan === "pro_year" ? "Pro Jaar" : planState.plan === "pro_event" ? "Pro Event" : null;

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Auth pages render without navigation chrome
  if (AUTH_PATHS.some((path) => pathname.startsWith(path))) {
    return <>{children}</>;
  }

  // Loading: toon alleen logo + lege nav-balk op dezelfde hoogte
  if (status === "loading") {
    return (
      <div className="app-shell">
        <header className="app-header">
          <Link href="/dashboard" className="brand">
            <img src="/logo.png" alt="Plan je Kroegentocht" className="brand-logo" />
          </Link>
          <nav className="top-nav" />
        </header>
        <main className="page">{children}</main>
        <footer className="app-footer">
          &copy; 2026 PlanJeKroegentocht.nl &mdash; een product ontwikkeld door <a href="https://eyecatching.cloud" target="_blank" rel="noopener noreferrer">EyeCatching.Cloud</a>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/dashboard" className="brand" style={{ position: "relative" }}>
          <img src="/logo.png" alt="Plan je Kroegentocht" className="brand-logo" />
          {proBadgeLabel && <span className="pro-badge-logo">{proBadgeLabel}</span>}
        </Link>
        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
          aria-expanded={menuOpen}
        >
          <span className={`hamburger-icon ${menuOpen ? "open" : ""}`} />
        </button>
        <nav className={`top-nav ${menuOpen ? "nav-open" : ""}`}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "nav-link active" : "nav-link"}
              onClick={() => {
                if (item.href === pathname) {
                  window.dispatchEvent(new CustomEvent("nav-reclick", { detail: item.href }));
                }
              }}
            >
              {item.label}
            </Link>
          ))}
          {session?.user && (
            <>
              <OrgSwitcher />
              <Link
                href="/settings"
                className={pathname.startsWith("/settings") ? "nav-link active" : "nav-link"}
              >
                Instellingen
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="nav-link"
                style={{
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid transparent",
                  color: "var(--muted)",
                  fontSize: "inherit",
                }}
              >
                Uitloggen
              </button>
            </>
          )}
        </nav>
      </header>
      <main className="page">{children}</main>
      <footer className="app-footer">
        &copy; 2026 PlanJeKroegentocht.nl &mdash; een product ontwikkeld door <a href="https://eyecatching.cloud" target="_blank" rel="noopener noreferrer">EyeCatching.Cloud</a>
      </footer>
    </div>
  );
}
