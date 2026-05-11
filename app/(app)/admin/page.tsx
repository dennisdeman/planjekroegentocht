"use client";

import { useEffect, useState } from "react";

interface RevenueRow {
  month: string;
  plan: string;
  count: number;
  revenue_cents: number;
  coupon_discount_cents: number;
}

interface DashboardStats {
  totalUsers: number;
  totalOrgs: number;
  totalConfigs: number;
  totalPlans: number;
  planDistribution: { free: number; pro_event: number; pro_year: number };
  totalPayments: number;
  totalRevenueCents: number;
  recentUsers: Array<{ id: string; email: string; name: string; created_at: string }>;
  recentPayments: Array<{ id: string; org_name: string; plan: string; amount_cents: number; status: string; created_at: string }>;
  topOrgs: Array<{ id: string; name: string; member_count: number }>;
  revenue: RevenueRow[];
}

const PLAN_LABELS: Record<string, string> = { free: "Free", pro_event: "Pro Event", pro_year: "Pro Jaar" };
const STATUS_LABELS: Record<string, string> = { paid: "Betaald", pending: "In behandeling", canceled: "Geannuleerd", expired: "Verlopen", failed: "Mislukt" };

interface SearchResults {
  users: Array<{ id: string; name: string; email: string; is_superadmin: boolean }>;
  orgs: Array<{ id: string; name: string; slug: string; active_plan: string }>;
  payments: Array<{ id: string; org_name: string; plan: string; amount_cents: number; status: string }>;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  async function doSearch() {
    if (searchQuery.trim().length < 2) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(await res.json());
    } catch { /* ignore */ }
    setSearching(false);
  }

  if (!stats) return <div className="card"><p>Laden...</p></div>;

  const revenue = (stats.totalRevenueCents / 100).toFixed(2).replace(".", ",");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Superadmin Dashboard</h2>

      {/* Globale zoekbalk */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Zoek gebruikers, organisaties, betalingen..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
          style={{ flex: 1 }}
        />
        <button onClick={doSearch} disabled={searching}>{searching ? "Zoeken..." : "Zoeken"}</button>
      </div>

      {searchResults && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ margin: "0 0 8px" }}>Zoekresultaten</h4>
          {searchResults.users.length === 0 && searchResults.orgs.length === 0 && searchResults.payments.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>Geen resultaten gevonden.</p>
          )}
          {searchResults.users.length > 0 && (
            <>
              <h5 style={{ margin: "8px 0 4px", fontSize: "0.85rem" }}>Gebruikers ({searchResults.users.length})</h5>
              {searchResults.users.map((u) => (
                <div key={u.id} style={{ fontSize: "0.85rem", padding: "3px 0" }}>
                  <a href={`/admin/users`} style={{ color: "var(--brand)" }}>{u.name || u.email}</a>
                  <span className="muted" style={{ marginLeft: 8 }}>{u.email}</span>
                  {u.is_superadmin && <span style={{ marginLeft: 6, fontSize: "0.75rem", color: "#dc2626" }}>superadmin</span>}
                </div>
              ))}
            </>
          )}
          {searchResults.orgs.length > 0 && (
            <>
              <h5 style={{ margin: "8px 0 4px", fontSize: "0.85rem" }}>Organisaties ({searchResults.orgs.length})</h5>
              {searchResults.orgs.map((o) => (
                <div key={o.id} style={{ fontSize: "0.85rem", padding: "3px 0" }}>
                  <a href={`/admin/orgs`} style={{ color: "var(--brand)" }}>{o.name}</a>
                  <span className="muted" style={{ marginLeft: 8 }}>{o.slug} — {PLAN_LABELS[o.active_plan] ?? o.active_plan}</span>
                </div>
              ))}
            </>
          )}
          {searchResults.payments.length > 0 && (
            <>
              <h5 style={{ margin: "8px 0 4px", fontSize: "0.85rem" }}>Betalingen ({searchResults.payments.length})</h5>
              {searchResults.payments.map((p) => (
                <div key={p.id} style={{ fontSize: "0.85rem", padding: "3px 0" }}>
                  <a href={`/admin/payments`} style={{ color: "var(--brand)" }}>{p.org_name}</a>
                  <span className="muted" style={{ marginLeft: 8 }}>{PLAN_LABELS[p.plan] ?? p.plan} — &euro;{(p.amount_cents / 100).toFixed(2).replace(".", ",")} — {STATUS_LABELS[p.status] ?? p.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <StatCard label="Gebruikers" value={stats.totalUsers} />
        <StatCard label="Organisaties" value={stats.totalOrgs} />
        <StatCard label="Configuraties" value={stats.totalConfigs} />
        <StatCard label="Planningen" value={stats.totalPlans} />
        <StatCard label="Betalingen" value={stats.totalPayments} />
        <StatCard label="Omzet" value={`€${revenue}`} />
      </div>

      {/* Plan verdeling */}
      <div className="card">
        <h3 style={{ margin: "0 0 10px" }}>Plan verdeling</h3>
        <div style={{ display: "flex", gap: 24, fontSize: "0.9rem" }}>
          <div><strong>{stats.planDistribution.free}</strong> <span className="muted">Free</span></div>
          <div><strong>{stats.planDistribution.pro_event}</strong> <span className="muted">Pro Event</span></div>
          <div><strong>{stats.planDistribution.pro_year}</strong> <span className="muted">Pro Jaar</span></div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
        {/* Recente betalingen */}
        <div className="card">
          <h3 style={{ margin: "0 0 10px" }}>Recente betalingen</h3>
          {stats.recentPayments.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Geen betalingen.</p>
          ) : (
            <table style={{ width: "100%", fontSize: "0.85rem" }}>
              <tbody>
                {stats.recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: "4px 8px 4px 0" }}>{p.org_name}</td>
                    <td style={{ padding: "4px 4px" }}>{PLAN_LABELS[p.plan] ?? p.plan}</td>
                    <td style={{ padding: "4px 4px" }}>&euro;{(p.amount_cents / 100).toFixed(2).replace(".", ",")}</td>
                    <td className="muted" style={{ padding: "4px 0" }}>{STATUS_LABELS[p.status] ?? p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recente registraties */}
        <div className="card">
          <h3 style={{ margin: "0 0 10px" }}>Recente registraties</h3>
          {stats.recentUsers.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Geen gebruikers.</p>
          ) : (
            <table style={{ width: "100%", fontSize: "0.85rem" }}>
              <tbody>
                {stats.recentUsers.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: "4px 8px 4px 0" }}>{u.name || u.email}</td>
                    <td className="muted" style={{ padding: "4px 0" }}>{new Date(u.created_at).toLocaleDateString("nl-NL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 10px" }}>Grootste organisaties</h3>
        {stats.topOrgs.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Geen organisaties.</p>
        ) : (
          <table style={{ width: "100%", fontSize: "0.85rem" }}>
            <tbody>
              {stats.topOrgs.map((o) => (
                <tr key={o.id}>
                  <td style={{ padding: "4px 8px 4px 0" }}>{o.name}</td>
                  <td className="muted" style={{ padding: "4px 0" }}>{o.member_count} {o.member_count === 1 ? "lid" : "leden"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Revenue per maand */}
      {stats.revenue && stats.revenue.length > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 10px" }}>Omzet per maand</h3>
          <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Maand</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Plan</th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>Aantal</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Omzet</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Coupon korting</th>
              </tr>
            </thead>
            <tbody>
              {stats.revenue.map((r, i) => (
                <tr key={`${r.month}-${r.plan}-${i}`} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "6px 8px" }}>{r.month}</td>
                  <td style={{ padding: "6px 8px" }}>{PLAN_LABELS[r.plan] ?? r.plan}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{r.count}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>&euro;{(r.revenue_cents / 100).toFixed(2).replace(".", ",")}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.coupon_discount_cents > 0 ? `€${(r.coupon_discount_cents / 100).toFixed(2).replace(".", ",")}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <p style={{ margin: 0, fontSize: "1.8rem", fontWeight: 700 }}>{value}</p>
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>{label}</p>
    </div>
  );
}
