"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@ui/ui/confirm-dialog";

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  email_verified_at: string | null;
  is_superadmin: boolean;
  created_at: string;
  org_count: number;
  config_count: number;
}

interface UserDetail {
  user: UserRow & { password_hash: string | null };
  memberships: Array<{ id: string; org_id: string; org_name: string; org_slug: string; role: string }>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editingUser, setEditingUser] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadUsers = useCallback((q?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    fetch(`/api/admin/users?${params}`)
      .then((r) => r.json())
      .then((data) => { setUsers(data.users); setTotal(data.total); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function loadDetail(userId: string) {
    fetch(`/api/admin/users?id=${userId}`)
      .then((r) => r.json())
      .then(setSelected)
      .catch(() => {});
  }

  async function doAction(action: string, userId: string, extra?: Record<string, string>) {
    setMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ text: data.error ?? "Actie mislukt.", type: "error" });
      return;
    }
    setMessage({ text: "Actie uitgevoerd.", type: "success" });
    loadUsers(search);
    if (action === "delete") setSelected(null);
    else if (selected) loadDetail(userId);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Gebruikers ({total})</h2>

      {message && (
        <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`}>
          <p style={{ margin: 0 }}>{message.text}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Zoek op naam of email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") loadUsers(search); }}
          style={{ flex: 1 }}
        />
        <button onClick={() => loadUsers(search)}>Zoeken</button>
        <button className="btn-ghost btn-sm" onClick={() => {
          downloadCsv("gebruikers.csv",
            ["Naam", "Email", "Geverifieerd", "Superadmin", "Organisaties", "Aangemeld"],
            users.map((u) => [u.name, u.email, u.email_verified_at ? "Ja" : "Nee", u.is_superadmin ? "Ja" : "Nee", String(u.org_count), new Date(u.created_at).toLocaleDateString("nl-NL")])
          );
        }}>CSV export</button>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: "0.85rem" }}>{selectedIds.size} geselecteerd</span>
          <button className="btn-sm" disabled={bulkBusy} onClick={async () => {
            if (!await confirmDialog({ title: "Email bevestigen", message: `Email bevestigen voor ${selectedIds.size} gebruikers?`, confirmLabel: "Bevestigen", variant: "danger" })) return;
            setBulkBusy(true);
            for (const id of selectedIds) {
              await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-email", userId: id }) });
            }
            setBulkBusy(false);
            setSelectedIds(new Set());
            setMessage({ text: `${selectedIds.size} emails bevestigd.`, type: "success" });
            loadUsers(search);
          }}>
            {bulkBusy ? "Bezig..." : "Bulk email bevestigen"}
          </button>
          <button className="btn-sm danger-button" disabled={bulkBusy} onClick={async () => {
            if (!await confirmDialog({ title: "Gebruikers verwijderen", message: `Weet je zeker dat je ${selectedIds.size} gebruikers wilt verwijderen?`, confirmLabel: "Verwijderen", variant: "danger" })) return;
            setBulkBusy(true);
            for (const id of selectedIds) {
              await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", userId: id }) });
            }
            setBulkBusy(false);
            setSelectedIds(new Set());
            setSelected(null);
            setMessage({ text: `${selectedIds.size} gebruikers verwijderd.`, type: "success" });
            loadUsers(search);
          }}>
            {bulkBusy ? "Bezig..." : "Bulk verwijderen"}
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: selected ? "1fr 1fr" : "1fr" }}>
        <div className="card" style={{ overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "6px 4px", width: 28 }}>
                  <input type="checkbox" checked={selectedIds.size === users.length && users.length > 0} onChange={(e) => {
                    setSelectedIds(e.target.checked ? new Set(users.map((u) => u.id)) : new Set());
                  }} />
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Naam</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>Geverifieerd</th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>Orgs</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Aangemeld</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => loadDetail(u.id)}
                  style={{ cursor: "pointer", borderBottom: "1px solid var(--line)", background: selected?.user.id === u.id ? "rgba(15,108,115,0.06)" : undefined }}
                >
                  <td style={{ padding: "6px 4px" }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(u.id)} onChange={(e) => {
                      const next = new Set(selectedIds);
                      e.target.checked ? next.add(u.id) : next.delete(u.id);
                      setSelectedIds(next);
                    }} />
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {u.name || "-"}
                    {u.is_superadmin && <span style={{ marginLeft: 6, fontSize: "0.75rem", background: "rgba(220,38,38,0.1)", color: "#dc2626", padding: "1px 6px", borderRadius: 99 }}>superadmin</span>}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{u.email}</td>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>{u.email_verified_at ? "\u2705" : "\u274C"}</td>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>{u.org_count}</td>
                  <td style={{ padding: "6px 8px" }}>{new Date(u.created_at).toLocaleDateString("nl-NL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{selected.user.name || selected.user.email}</h3>
              <button className="btn-ghost btn-sm" style={{ fontSize: "0.78rem" }} onClick={() => {
                setEditUserName(selected.user.name);
                setEditUserEmail(selected.user.email);
                setEditingUser((v) => !v);
              }}>
                {editingUser ? "Annuleren" : "Bewerken"}
              </button>
            </div>

            {editingUser && (
              <div style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "var(--bg-alt)", borderRadius: 8 }}>
                <label style={{ fontSize: "0.85rem" }}>
                  Naam
                  <input type="text" value={editUserName} onChange={(e) => setEditUserName(e.target.value)} />
                </label>
                <label style={{ fontSize: "0.85rem" }}>
                  Email
                  <input type="email" value={editUserEmail} onChange={(e) => setEditUserEmail(e.target.value)} />
                </label>
                <button className="btn-primary btn-sm" onClick={async () => {
                  await doAction("update-user", selected.user.id, { name: editUserName, email: editUserEmail });
                  setEditingUser(false);
                }}>Opslaan</button>
              </div>
            )}

            <dl style={{ margin: 0, fontSize: "0.85rem" }}>
              <dt style={{ fontWeight: 600 }}>Email</dt>
              <dd style={{ margin: "0 0 8px" }}>{selected.user.email}</dd>
              <dt style={{ fontWeight: 600 }}>Geverifieerd</dt>
              <dd style={{ margin: "0 0 8px" }}>{selected.user.email_verified_at ? new Date(selected.user.email_verified_at).toLocaleString("nl-NL") : "Nee"}</dd>
              <dt style={{ fontWeight: 600 }}>Aangemeld</dt>
              <dd style={{ margin: "0 0 8px" }}>{new Date(selected.user.created_at).toLocaleString("nl-NL")}</dd>
              <dt style={{ fontWeight: 600 }}>Organisaties</dt>
              <dd style={{ margin: "0 0 8px" }}>
                {selected.memberships.length === 0 ? "Geen" : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {selected.memberships.map((m) => (
                      <li key={m.id}>{m.org_name} ({m.role})</li>
                    ))}
                  </ul>
                )}
              </dd>
            </dl>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {!selected.user.email_verified_at && (
                <button className="btn-sm" onClick={() => doAction("verify-email", selected.user.id)}>
                  Email bevestigen
                </button>
              )}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Nieuw wachtwoord"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: 160, fontSize: "0.85rem" }}
                />
                <button
                  className="btn-sm"
                  disabled={newPassword.length < 8}
                  onClick={() => { doAction("reset-password", selected.user.id, { newPassword }); setNewPassword(""); }}
                >
                  Reset wachtwoord
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn-sm"
                  onClick={async () => {
                    if (!await confirmDialog({ title: "Inloggen als gebruiker", message: `Wil je inloggen als ${selected.user.email}? Je wordt uitgelogd uit je huidige sessie.`, confirmLabel: "Inloggen als", variant: "danger" })) return;
                    try {
                      const res = await fetch("/api/admin/impersonate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: selected.user.id }),
                      });
                      const data = await res.json();
                      if (!res.ok) { setMessage({ text: data.error ?? "Impersonation mislukt.", type: "error" }); return; }
                      // Cookie is server-side gezet, alleen herladen
                      window.location.href = "/dashboard";
                    } catch {
                      setMessage({ text: "Impersonation mislukt.", type: "error" });
                    }
                  }}
                >
                  Inloggen als
                </button>
                <button
                  className="btn-sm"
                  onClick={() => doAction("toggle-superadmin", selected.user.id)}
                >
                  {selected.user.is_superadmin ? "Superadmin intrekken" : "Superadmin maken"}
                </button>
                <button
                  className="btn-sm danger-button"
                  onClick={async () => { if (await confirmDialog({ title: "Gebruiker verwijderen", message: `Weet je zeker dat je ${selected.user.email} wilt verwijderen?`, confirmLabel: "Verwijderen", variant: "danger" })) doAction("delete", selected.user.id); }}
                >
                  Verwijderen
                </button>
              </div>
            </div>

            <button className="btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setSelected(null)}>
              Sluiten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
