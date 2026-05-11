"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@ui/ui/confirm-dialog";

interface Coupon {
  id: string;
  code: string;
  discount_cents: number;
  description: string | null;
  valid_for_plan: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = { pro_event: "Pro Event", pro_year: "Pro Jaar" };

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discountCents: "",
    description: "",
    validForPlan: "",
    maxUses: "",
    expiresAt: "",
  });

  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [editForm, setEditForm] = useState({ discountCents: "", description: "", validForPlan: "", maxUses: "", expiresAt: "" });

  const load = useCallback(() => {
    fetch("/api/admin/coupons")
      .then((r) => r.json())
      .then((data) => setCoupons(data.coupons))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, extra: Record<string, unknown>) {
    setMessage(null);
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ text: data.error ?? "Actie mislukt.", type: "error" });
      return;
    }
    setMessage({ text: "Actie uitgevoerd.", type: "success" });
    load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const discountCents = Math.round(parseFloat(form.discountCents.replace(",", ".")) * 100);
    if (!form.code.trim() || isNaN(discountCents) || discountCents <= 0) {
      setMessage({ text: "Code en geldig kortingsbedrag zijn verplicht.", type: "error" });
      return;
    }
    await doAction("create", {
      code: form.code,
      discountCents,
      description: form.description || undefined,
      validForPlan: form.validForPlan || undefined,
      maxUses: form.maxUses ? parseInt(form.maxUses, 10) : undefined,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
    });
    setForm({ code: "", discountCents: "", description: "", validForPlan: "", maxUses: "", expiresAt: "" });
    setCreating(false);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Coupons ({coupons.length})</h2>
        <button className="btn-primary btn-sm" onClick={() => setCreating((v) => !v)}>
          {creating ? "Annuleren" : "Nieuwe coupon"}
        </button>
      </div>

      {message && (
        <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`}>
          <p style={{ margin: 0 }}>{message.text}</p>
        </div>
      )}

      {creating && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ margin: "0 0 12px" }}>Nieuwe coupon aanmaken</h3>
          <form onSubmit={handleCreate} style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              <span style={{ fontSize: "0.85rem" }}>Code</span>
              <input type="text" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} required placeholder="KROEGENTOCHT2026" style={{ textTransform: "uppercase" }} />
            </label>
            <label>
              <span style={{ fontSize: "0.85rem" }}>Korting (&euro;)</span>
              <input type="text" value={form.discountCents} onChange={(e) => setForm((f) => ({ ...f, discountCents: e.target.value }))} required placeholder="5,00" />
            </label>
            <label>
              <span style={{ fontSize: "0.85rem" }}>Beschrijving (optioneel)</span>
              <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Marketing campagne X" />
            </label>
            <label>
              <span style={{ fontSize: "0.85rem" }}>Geldig voor plan (optioneel)</span>
              <select value={form.validForPlan} onChange={(e) => setForm((f) => ({ ...f, validForPlan: e.target.value }))}>
                <option value="">Alle plannen</option>
                <option value="pro_event">Pro Event</option>
                <option value="pro_year">Pro Jaar</option>
              </select>
            </label>
            <label>
              <span style={{ fontSize: "0.85rem" }}>Max gebruik (optioneel)</span>
              <input type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Onbeperkt" min="1" />
            </label>
            <label>
              <span style={{ fontSize: "0.85rem" }}>Verloopdatum (optioneel)</span>
              <input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn-primary">Aanmaken</button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Code</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Korting</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Geldig voor</th>
              <th style={{ textAlign: "center", padding: "6px 8px" }}>Gebruik</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Verloopt</th>
              <th style={{ textAlign: "center", padding: "6px 8px" }}>Status</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Acties</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "6px 8px", fontWeight: 600, fontFamily: "monospace" }}>{c.code}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>&euro;{(c.discount_cents / 100).toFixed(2).replace(".", ",")}</td>
                <td style={{ padding: "6px 8px" }}>{c.valid_for_plan ? PLAN_LABELS[c.valid_for_plan] : "Alle"}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}</td>
                <td style={{ padding: "6px 8px" }}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString("nl-NL") : "—"}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                  <span style={{
                    padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem",
                    background: c.active ? "#d1fae5" : "#fee2e2",
                    color: c.active ? "#065f46" : "#991b1b",
                  }}>
                    {c.active ? "Actief" : "Inactief"}
                  </span>
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                  <button
                    className="btn-ghost btn-sm"
                    style={{ fontSize: "0.78rem" }}
                    onClick={() => {
                      setEditCoupon(c);
                      setEditForm({
                        discountCents: (c.discount_cents / 100).toFixed(2).replace(".", ","),
                        description: c.description ?? "",
                        validForPlan: c.valid_for_plan ?? "",
                        maxUses: c.max_uses?.toString() ?? "",
                        expiresAt: c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : "",
                      });
                    }}
                  >
                    Bewerken
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    style={{ fontSize: "0.78rem" }}
                    onClick={() => doAction("toggle", { couponId: c.id, active: !c.active })}
                  >
                    {c.active ? "Deactiveren" : "Activeren"}
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    style={{ fontSize: "0.78rem", color: "#dc2626", marginLeft: 4 }}
                    onClick={async () => { if (await confirmDialog({ title: "Coupon verwijderen", message: `Coupon "${c.code}" verwijderen?`, confirmLabel: "Verwijderen", variant: "danger" })) doAction("delete", { couponId: c.id }); }}
                  >
                    Verwijder
                  </button>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ padding: 16, textAlign: "center" }}>Geen coupons aangemaakt.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editCoupon && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditCoupon(null); }}>
          <div className="help-modal-card" style={{ width: "min(440px, 100%)" }}>
            <div className="help-modal-header">
              <h3>Coupon bewerken: {editCoupon.code}</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditCoupon(null)}>Sluiten</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const discountCents = Math.round(parseFloat(editForm.discountCents.replace(",", ".")) * 100);
              if (isNaN(discountCents) || discountCents <= 0) {
                setMessage({ text: "Ongeldig kortingsbedrag.", type: "error" });
                return;
              }
              await doAction("update", {
                couponId: editCoupon.id,
                discountCents,
                description: editForm.description || undefined,
                validForPlan: editForm.validForPlan || null,
                maxUses: editForm.maxUses ? parseInt(editForm.maxUses, 10) : null,
                expiresAt: editForm.expiresAt ? new Date(editForm.expiresAt).toISOString() : null,
              });
              setEditCoupon(null);
            }} style={{ display: "grid", gap: 10 }}>
              <label>
                <span style={{ fontSize: "0.85rem" }}>Korting (&euro;)</span>
                <input type="text" value={editForm.discountCents} onChange={(e) => setEditForm((f) => ({ ...f, discountCents: e.target.value }))} required />
              </label>
              <label>
                <span style={{ fontSize: "0.85rem" }}>Beschrijving</span>
                <input type="text" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              <label>
                <span style={{ fontSize: "0.85rem" }}>Geldig voor plan</span>
                <select value={editForm.validForPlan} onChange={(e) => setEditForm((f) => ({ ...f, validForPlan: e.target.value }))}>
                  <option value="">Alle plannen</option>
                  <option value="pro_event">Pro Event</option>
                  <option value="pro_year">Pro Jaar</option>
                </select>
              </label>
              <label>
                <span style={{ fontSize: "0.85rem" }}>Max gebruik</span>
                <input type="number" value={editForm.maxUses} onChange={(e) => setEditForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Onbeperkt" min="1" />
              </label>
              <label>
                <span style={{ fontSize: "0.85rem" }}>Verloopdatum</span>
                <input type="date" value={editForm.expiresAt} onChange={(e) => setEditForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </label>
              <button type="submit" className="btn-primary">Opslaan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
