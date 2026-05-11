"use client";

import { useEffect, useState } from "react";

interface ActivityEntry {
  id: string;
  user_id: string | null;
  user_email?: string;
  user_name?: string;
  org_id: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  // Admin acties
  "admin.user.verify-email": "Email geverifieerd (admin)",
  "admin.user.reset-password": "Wachtwoord gereset (admin)",
  "admin.user.delete": "Gebruiker verwijderd (admin)",
  "admin.org.rename": "Organisatie hernoemd (admin)",
  "admin.org.add-member": "Lid toegevoegd (admin)",
  "admin.org.remove-member": "Lid verwijderd (admin)",
  "admin.org.delete": "Organisatie verwijderd (admin)",
  // Gebruiker acties
  "user.register": "Account aangemaakt",
  "user.verify-email": "Email geverifieerd",
  "user.accept-invite": "Uitnodiging geaccepteerd",
  "user.reset-password": "Wachtwoord gereset",
  "user.update-name": "Naam gewijzigd",
  "user.change-password": "Wachtwoord gewijzigd",
  // Organisatie acties
  "org.invite": "Uitnodiging verstuurd",
  "org.remove-member": "Lid verwijderd",
  "org.rename": "Organisatie hernoemd",
  // Planner acties
  "planner.save-config": "Configuratie opgeslagen",
  "planner.save-plan": "Planning opgeslagen",
};

export default function AdminActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    fetch(`/api/admin/activity?limit=${limit}&offset=${offset}`)
      .then((r) => r.json())
      .then((data) => { setEntries(data.entries); setTotal(data.total); })
      .catch(() => {});
  }, [offset]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Activiteitenlog ({total})</h2>

      <div className="card" style={{ overflow: "auto" }}>
        {entries.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Geen activiteiten gelogd.</p>
        ) : (
          <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Datum</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Gebruiker</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Actie</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    {new Date(e.created_at).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{e.user_name || e.user_email || "-"}</td>
                  <td style={{ padding: "6px 8px" }}>{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td style={{ padding: "6px 8px" }} className="muted">
                    {e.detail ? Object.entries(e.detail).map(([k, v]) => `${k}: ${v}`).join(", ") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > limit && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
            <button className="btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              Vorige
            </button>
            <span className="muted" style={{ fontSize: "0.85rem", lineHeight: "28px" }}>
              {offset + 1}-{Math.min(offset + limit, total)} van {total}
            </span>
            <button className="btn-ghost btn-sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
              Volgende
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
