"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@ui/ui/confirm-dialog";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  active_plan: string;
  plan_expires_at: string | null;
  trial_expires_at: string | null;
  plan_frozen: boolean;
  created_at: string;
  member_count: number;
  config_count: number;
  plan_count: number;
}

interface OrgDetail {
  org: OrgRow & { logo_data: string | null };
  members: Array<{ id: string; user_id: string; user_name: string; user_email: string; role: string }>;
  configCount: number;
  planCount: number;
  configs: Array<{ id: string; name: string; groups: number; stations: number; updated_at: string }>;
  plans: Array<{ id: string; config_id: string; config_name: string; updated_at: string }>;
}

const PLAN_LABELS: Record<string, string> = { free: "Free", pro_event: "Pro Event", pro_year: "Pro Jaar" };

function planBadge(plan: string, frozen: boolean) {
  if (frozen) return <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem", background: "#fef3c7", color: "#92400e" }}>Bevroren</span>;
  if (plan === "pro_year") return <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem", background: "#d1fae5", color: "#065f46" }}>Pro Jaar</span>;
  if (plan === "pro_event") return <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem", background: "#dbeafe", color: "#1e40af" }}>Pro Event</span>;
  return <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem", background: "#f3f4f6", color: "#6b7280" }}>Free</span>;
}

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrgDetail | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [editName, setEditName] = useState("");
  const [editing, setEditing] = useState(false);

  // Plan edit state
  const [editingPlan, setEditingPlan] = useState(false);
  const [planForm, setPlanForm] = useState({ plan: "free", expiresAt: "", frozen: false });

  // Add member state
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<"admin" | "member">("member");

  const loadOrgs = useCallback((q?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    fetch(`/api/admin/orgs?${params}`)
      .then((r) => r.json())
      .then((data) => { setOrgs(data.orgs); setTotal(data.total); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  function loadDetail(orgId: string) {
    fetch(`/api/admin/orgs?id=${orgId}`)
      .then((r) => r.json())
      .then((data: OrgDetail) => { setSelected(data); setEditing(false); setEditingPlan(false); })
      .catch(() => {});
  }

  async function doAction(action: string, extra?: Record<string, unknown>) {
    if (!selected) return;
    setMessage(null);
    const res = await fetch("/api/admin/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, orgId: selected.org.id, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ text: data.error ?? "Actie mislukt.", type: "error" });
      return;
    }
    setMessage({ text: "Actie uitgevoerd.", type: "success" });
    loadOrgs(search);
    if (action === "delete") setSelected(null);
    else loadDetail(selected.org.id);
  }

  async function removeMember(membershipId: string) {
    if (!selected) return;
    setMessage(null);
    const res = await fetch("/api/admin/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove-member", orgId: selected.org.id, membershipId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ text: data.error ?? "Actie mislukt.", type: "error" });
      return;
    }
    setMessage({ text: "Lid verwijderd.", type: "success" });
    loadDetail(selected.org.id);
    loadOrgs(search);
  }

  function openPlanEditor() {
    if (!selected) return;
    const expires = selected.org.plan_expires_at || selected.org.trial_expires_at;
    setPlanForm({
      plan: selected.org.active_plan,
      expiresAt: expires ? new Date(expires).toISOString().slice(0, 10) : "",
      frozen: selected.org.plan_frozen,
    });
    setEditingPlan(true);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Organisaties ({total})</h2>

      {message && (
        <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`}>
          <p style={{ margin: 0 }}>{message.text}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Zoek op naam of slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") loadOrgs(search); }}
          style={{ flex: 1 }}
        />
        <button onClick={() => loadOrgs(search)}>Zoeken</button>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: selected ? "1fr 1fr" : "1fr" }}>
        <div className="card" style={{ overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Naam</th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>Plan</th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>Leden</th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>Configs</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Aangemaakt</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => loadDetail(o.id)}
                  style={{ cursor: "pointer", borderBottom: "1px solid var(--line)", background: selected?.org.id === o.id ? "rgba(15,108,115,0.06)" : undefined }}
                >
                  <td style={{ padding: "6px 8px" }}>{o.name}</td>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>{planBadge(o.active_plan, o.plan_frozen)}</td>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>{o.member_count}</td>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>{o.config_count}</td>
                  <td style={{ padding: "6px 8px" }}>{new Date(o.created_at).toLocaleDateString("nl-NL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="card">
            {editing ? (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ flex: 1 }} />
                <button className="btn-sm" onClick={() => { doAction("rename", { name: editName }); setEditing(false); }}>Opslaan</button>
                <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Annuleren</button>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>{selected.org.name}</h3>
                <button className="btn-ghost btn-sm" onClick={() => { setEditName(selected.org.name); setEditing(true); }}>Hernoemen</button>
              </div>
            )}

            <dl style={{ margin: 0, fontSize: "0.85rem" }}>
              <dt style={{ fontWeight: 600 }}>Slug</dt>
              <dd style={{ margin: "0 0 8px" }}>{selected.org.slug}</dd>
              <dt style={{ fontWeight: 600 }}>Plan</dt>
              <dd style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
                {planBadge(selected.org.active_plan, selected.org.plan_frozen)}
                {PLAN_LABELS[selected.org.active_plan] ?? selected.org.active_plan}
                <button className="btn-ghost btn-sm" onClick={openPlanEditor} style={{ fontSize: "0.78rem" }}>Wijzigen</button>
              </dd>
              <dt style={{ fontWeight: 600 }}>Verloopdatum</dt>
              <dd style={{ margin: "0 0 8px" }}>
                {selected.org.plan_expires_at
                  ? new Date(selected.org.plan_expires_at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
                  : selected.org.trial_expires_at
                    ? `Trial: ${new Date(selected.org.trial_expires_at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}`
                    : "—"}
              </dd>
              <dt style={{ fontWeight: 600 }}>Aangemaakt</dt>
              <dd style={{ margin: "0 0 8px" }}>{new Date(selected.org.created_at).toLocaleString("nl-NL")}</dd>
              <dt style={{ fontWeight: 600 }}>Configuraties / Planningen</dt>
              <dd style={{ margin: "0 0 8px" }}>{selected.configCount} / {selected.planCount}</dd>
            </dl>

            {/* Plan editor */}
            {editingPlan && (
              <div style={{ padding: 12, background: "var(--bg-alt)", borderRadius: 8, marginBottom: 12 }}>
                <h4 style={{ margin: "0 0 8px" }}>Plan wijzigen</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ fontSize: "0.85rem" }}>
                    Plan
                    <select value={planForm.plan} onChange={(e) => setPlanForm((f) => ({ ...f, plan: e.target.value }))}>
                      <option value="free">Free</option>
                      <option value="pro_event">Pro Event</option>
                      <option value="pro_year">Pro Jaar</option>
                    </select>
                  </label>
                  <label style={{ fontSize: "0.85rem" }}>
                    Verloopdatum
                    <input type="date" value={planForm.expiresAt} onChange={(e) => setPlanForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                  </label>
                  <label style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={planForm.frozen} onChange={(e) => setPlanForm((f) => ({ ...f, frozen: e.target.checked }))} />
                    Bevroren (read-only)
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary btn-sm" onClick={() => {
                      doAction("update-plan", {
                        plan: planForm.plan,
                        expiresAt: planForm.expiresAt ? new Date(planForm.expiresAt).toISOString() : null,
                        frozen: planForm.frozen,
                      });
                      setEditingPlan(false);
                    }}>Opslaan</button>
                    <button className="btn-ghost btn-sm" onClick={() => setEditingPlan(false)}>Annuleren</button>
                  </div>
                </div>
              </div>
            )}

            <h4 style={{ margin: "12px 0 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Leden ({selected.members.length})</span>
              <button className="btn-ghost btn-sm" style={{ fontSize: "0.78rem" }} onClick={() => setAddingMember((v) => !v)}>
                {addingMember ? "Annuleren" : "Lid toevoegen"}
              </button>
            </h4>

            {addingMember && (
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "end" }}>
                <input
                  type="email"
                  placeholder="Email van gebruiker"
                  value={addMemberEmail}
                  onChange={(e) => setAddMemberEmail(e.target.value)}
                  style={{ flex: "1 1 150px", fontSize: "0.85rem" }}
                />
                <select value={addMemberRole} onChange={(e) => setAddMemberRole(e.target.value as "admin" | "member")} style={{ fontSize: "0.85rem" }}>
                  <option value="member">Lid</option>
                  <option value="admin">Beheerder</option>
                </select>
                <button className="btn-primary btn-sm" onClick={async () => {
                  if (!addMemberEmail.trim()) return;
                  // Zoek userId op basis van email
                  const res = await fetch(`/api/admin/users?search=${encodeURIComponent(addMemberEmail.trim())}`);
                  const data = await res.json();
                  const user = data.users?.find((u: { email: string }) => u.email.toLowerCase() === addMemberEmail.trim().toLowerCase());
                  if (!user) { setMessage({ text: "Gebruiker niet gevonden.", type: "error" }); return; }
                  await doAction("add-member", { userId: user.id, role: addMemberRole });
                  setAddMemberEmail("");
                  setAddingMember(false);
                }}>Toevoegen</button>
              </div>
            )}

            {selected.members.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Geen leden.</p>
            ) : (
              <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                <tbody>
                  {selected.members.map((m) => (
                    <tr key={m.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "4px 8px 4px 0" }}>{m.user_name || m.user_email}</td>
                      <td style={{ padding: "4px 4px" }}>
                        <select
                          value={m.role}
                          onChange={(e) => doAction("update-member-role", { membershipId: m.id, newRole: e.target.value })}
                          style={{ fontSize: "0.78rem", padding: "2px 4px", border: "1px solid var(--line)", borderRadius: 4 }}
                        >
                          <option value="member">Lid</option>
                          <option value="admin">Beheerder</option>
                        </select>
                      </td>
                      <td style={{ padding: "4px 0", textAlign: "right" }}>
                        <button
                          className="btn-ghost btn-sm"
                          style={{ color: "#dc2626", fontSize: "0.78rem" }}
                          onClick={async (e) => { e.stopPropagation(); if (await confirmDialog({ title: "Lid verwijderen", message: `${m.user_name || m.user_email} verwijderen uit ${selected.org.name}?`, confirmLabel: "Verwijderen", variant: "danger" })) removeMember(m.id); }}
                        >
                          Verwijder
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Configuraties */}
            {selected.configs && selected.configs.length > 0 && (
              <>
                <h4 style={{ margin: "12px 0 6px" }}>Configuraties ({selected.configs.length})</h4>
                <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                  <tbody>
                    {selected.configs.map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "4px 8px 4px 0" }}>{c.name}</td>
                        <td className="muted" style={{ padding: "4px 4px" }}>{c.groups}g / {c.stations}s</td>
                        <td className="muted" style={{ padding: "4px 0" }}>{new Date(c.updated_at).toLocaleDateString("nl-NL")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Planningen */}
            {selected.plans && selected.plans.length > 0 && (
              <>
                <h4 style={{ margin: "12px 0 6px" }}>Planningen ({selected.plans.length})</h4>
                <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                  <tbody>
                    {selected.plans.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "4px 8px 4px 0" }}>{p.config_name}</td>
                        <td className="muted" style={{ padding: "4px 0" }}>{new Date(p.updated_at).toLocaleDateString("nl-NL")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="btn-sm danger-button"
                onClick={async () => { if (await confirmDialog({ title: "Organisatie verwijderen", message: `Weet je zeker dat je "${selected.org.name}" en alle bijbehorende data wilt verwijderen?`, confirmLabel: "Verwijderen", variant: "danger" })) doAction("delete"); }}
              >
                Organisatie verwijderen
              </button>
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
