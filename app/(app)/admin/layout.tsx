"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => {
        setAuthorized(res.ok);
      })
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) {
    return <div className="card"><p>Laden...</p></div>;
  }

  if (!authorized) {
    return (
      <div className="card">
        <h2>Geen toegang</h2>
        <p>Je hebt geen superadmin-rechten.</p>
        <Link href="/dashboard" className="button-link btn-primary">Terug naar dashboard</Link>
      </div>
    );
  }

  const tabs = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/users", label: "Gebruikers" },
    { href: "/admin/orgs", label: "Organisaties" },
    { href: "/admin/payments", label: "Betalingen" },
    { href: "/admin/invoices", label: "Facturen" },
    { href: "/admin/coupons", label: "Coupons" },
    { href: "/admin/activity", label: "Activiteitenlog" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={pathname === tab.href ? "nav-link active" : "nav-link"}
            style={{ fontSize: "0.85rem", padding: "6px 12px" }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
