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

interface PaymentRow {
  id: string;
  org_id: string;
  org_name: string;
  plan: string;
  amount_cents: number;
  status: string;
  provider_ref: string | null;
  coupon_id: string | null;
  description: string | null;
  invoice_number: string | null;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = { pro_event: "Pro Event", pro_year: "Pro Jaar" };
const STATUS_COLORS: Record<string, string> = {
  paid: "#065f46", pending: "#92400e", canceled: "#991b1b", expired: "#6b7280", failed: "#991b1b",
};
const STATUS_BG: Record<string, string> = {
  paid: "#d1fae5", pending: "#fef3c7", canceled: "#fee2e2", expired: "#f3f4f6", failed: "#fee2e2",
};
const STATUS_LABELS: Record<string, string> = {
  paid: "Betaald", pending: "In behandeling", canceled: "Geannuleerd", expired: "Verlopen", failed: "Mislukt", open: "Open",
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    params.set("offset", String(offset));
    fetch(`/api/admin/payments?${params}`)
      .then((r) => r.json())
      .then((data) => { setPayments(data.payments); setTotal(data.total); })
      .catch(() => {});
  }, [filter, offset]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Betalingen ({total})</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {["", "paid", "pending", "canceled", "failed"].map((s) => (
          <button
            key={s}
            className={filter === s ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
            onClick={() => { setFilter(s); setOffset(0); }}
          >
            {s === "" ? "Alle" : STATUS_LABELS[s] ?? s}
          </button>
        ))}
        <button className="btn-ghost btn-sm" onClick={() => {
          downloadCsv("betalingen.csv",
            ["Datum", "Organisatie", "Plan", "Bedrag", "Status", "Mollie ID"],
            payments.map((p) => [
              new Date(p.created_at).toLocaleDateString("nl-NL"),
              p.org_name, PLAN_LABELS[p.plan] ?? p.plan,
              (p.amount_cents / 100).toFixed(2).replace(".", ","),
              STATUS_LABELS[p.status] ?? p.status,
              p.provider_ref ?? "",
            ])
          );
        }}>CSV export</button>
      </div>

      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Datum</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Organisatie</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Plan</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Bedrag</th>
              <th style={{ textAlign: "center", padding: "6px 8px" }}>Status</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Mollie ID</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Factuur</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Acties</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{new Date(p.created_at).toLocaleDateString("nl-NL")} {new Date(p.created_at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}</td>
                <td style={{ padding: "6px 8px" }}>{p.org_name}</td>
                <td style={{ padding: "6px 8px" }}>{PLAN_LABELS[p.plan] ?? p.plan}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>&euro;{(p.amount_cents / 100).toFixed(2).replace(".", ",")}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                  <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem", background: STATUS_BG[p.status] ?? "#f3f4f6", color: STATUS_COLORS[p.status] ?? "#6b7280" }}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
                <td className="muted" style={{ padding: "6px 8px", fontSize: "0.78rem" }}>{p.provider_ref ?? "—"}</td>
                <td style={{ padding: "6px 8px", fontSize: "0.78rem", fontFamily: "monospace" }}>{p.invoice_number ?? "—"}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                  <select
                    value={p.status}
                    onChange={async (e) => {
                      const newStatus = e.target.value;
                      if (newStatus === p.status) return;
                      const msg = newStatus === "paid"
                        ? "Betaling markeren als betaald? Dit activeert het plan."
                        : `Status wijzigen naar "${STATUS_LABELS[newStatus] ?? newStatus}"?`;
                      if (!await confirmDialog({ title: "Status wijzigen", message: msg, confirmLabel: "Wijzigen", variant: "danger" })) { e.target.value = p.status; return; }
                      const res = await fetch("/api/admin/payments", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "update-status", paymentId: p.id, status: newStatus }),
                      });
                      if (res.ok) load();
                    }}
                    style={{ fontSize: "0.78rem", padding: "2px 4px", border: "1px solid var(--line)", borderRadius: 4 }}
                  >
                    <option value="pending">In behandeling</option>
                    <option value="paid">Betaald</option>
                    <option value="canceled">Geannuleerd</option>
                    <option value="failed">Mislukt</option>
                    <option value="refunded">Terugbetaald</option>
                  </select>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ padding: 16, textAlign: "center" }}>Geen betalingen gevonden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 50))}>Vorige</button>
          <span className="muted" style={{ fontSize: "0.85rem", lineHeight: "32px" }}>{offset + 1}–{Math.min(offset + 50, total)} van {total}</span>
          <button className="btn-ghost btn-sm" disabled={offset + 50 >= total} onClick={() => setOffset((o) => o + 50)}>Volgende</button>
        </div>
      )}
    </div>
  );
}
