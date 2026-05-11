"use client";

import { useCallback, useEffect, useState } from "react";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  payment_id: string | null;
  provider_ref: string | null;
  org_name: string;
  billing_type: string;
  billing_name: string;
  billing_company_name: string | null;
  description: string;
  amount_cents: number;
  vat_cents: number;
  total_cents: number;
  created_at: string;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("offset", String(offset));
    fetch(`/api/admin/invoices?${params}`)
      .then((r) => r.json())
      .then((data) => { setInvoices(data.invoices); setTotal(data.total); })
      .catch(() => {});
  }, [from, to, offset]);

  useEffect(() => { load(); }, [load]);

  async function downloadPdf(invoiceId: string, invoiceNumber: string) {
    setDownloading(invoiceId);
    try {
      const res = await fetch(`/api/admin/invoices?id=${invoiceId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.invoice?.pdf_data) {
        const link = document.createElement("a");
        link.href = data.invoice.pdf_data;
        link.download = `factuur-${invoiceNumber}.pdf`;
        link.click();
      }
    } catch { /* ignore */ }
    setDownloading(null);
  }

  async function downloadAllPdfs() {
    setDownloading("all");
    // Haal alle facturen op met huidige filters (geen limiet)
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", "999");
    try {
      const listRes = await fetch(`/api/admin/invoices?${params}`);
      const listData = await listRes.json();
      for (const inv of listData.invoices) {
        const res = await fetch(`/api/admin/invoices?id=${inv.id}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.invoice?.pdf_data) {
          const link = document.createElement("a");
          link.href = data.invoice.pdf_data;
          link.download = `factuur-${inv.invoice_number}.pdf`;
          link.click();
          // Kleine pauze zodat de browser het bijhoudt
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } catch { /* ignore */ }
    setDownloading(null);
  }

  const fmtEuro = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Facturen ({total})</h2>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: "0.85rem" }}>
          Van
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} />
        </label>
        <label style={{ fontSize: "0.85rem" }}>
          Tot
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} />
        </label>
        <button className="btn-ghost btn-sm" onClick={() => { setFrom(""); setTo(""); setOffset(0); }}>Reset</button>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost btn-sm" onClick={() => {
          downloadCsv(
            `facturen${from ? `-vanaf-${from}` : ""}${to ? `-tot-${to}` : ""}.csv`,
            ["Factuurnummer", "Datum", "Organisatie", "Type", "Naam", "Bedrijf", "Omschrijving", "Excl. BTW", "BTW", "Totaal"],
            invoices.map((inv) => [
              inv.invoice_number,
              new Date(inv.created_at).toLocaleDateString("nl-NL"),
              inv.org_name,
              inv.billing_type === "business" ? "Zakelijk" : "Particulier",
              inv.billing_name,
              inv.billing_company_name ?? "",
              inv.description,
              ((inv.amount_cents - inv.vat_cents) / 100).toFixed(2).replace(".", ","),
              (inv.vat_cents / 100).toFixed(2).replace(".", ","),
              (inv.total_cents / 100).toFixed(2).replace(".", ","),
            ])
          );
        }}>CSV export</button>
        <button
          className="btn-ghost btn-sm"
          disabled={downloading !== null || invoices.length === 0}
          onClick={downloadAllPdfs}
        >
          {downloading === "all" ? "Downloaden..." : "Alle PDF's downloaden"}
        </button>
      </div>

      {/* Tabel */}
      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Nummer</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Datum</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Organisatie</th>
              <th style={{ textAlign: "left", padding: "6px 8px", minWidth: 180 }}>Klant</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Omschrijving</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Excl. BTW</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>BTW</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Totaal</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Mollie ID</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>PDF</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "6px 8px", fontFamily: "monospace", whiteSpace: "nowrap" }}>{inv.invoice_number}</td>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{new Date(inv.created_at).toLocaleDateString("nl-NL")}</td>
                <td style={{ padding: "6px 8px" }}>{inv.org_name}</td>
                <td style={{ padding: "6px 8px" }}>
                  {inv.billing_type === "business" && inv.billing_company_name
                    ? `${inv.billing_company_name} / ${inv.billing_name}`
                    : inv.billing_name}
                </td>
                <td style={{ padding: "6px 8px" }}>{inv.description}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtEuro(inv.amount_cents - inv.vat_cents)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtEuro(inv.vat_cents)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>{fmtEuro(inv.total_cents)}</td>
                <td className="muted" style={{ padding: "6px 8px", fontSize: "0.78rem" }}>{inv.provider_ref ?? "—"}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                  <button
                    className="btn-ghost btn-sm"
                    style={{ fontSize: "0.78rem" }}
                    disabled={downloading !== null}
                    onClick={() => downloadPdf(inv.id, inv.invoice_number)}
                  >
                    {downloading === inv.id ? "..." : "PDF"}
                  </button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={10} className="muted" style={{ padding: 16, textAlign: "center" }}>Geen facturen gevonden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totaalregel */}
      {invoices.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, fontSize: "0.9rem", fontWeight: 600 }}>
          <span>Totaal excl. BTW: {fmtEuro(invoices.reduce((s, i) => s + i.amount_cents - i.vat_cents, 0))}</span>
          <span>BTW: {fmtEuro(invoices.reduce((s, i) => s + i.vat_cents, 0))}</span>
          <span>Totaal: {fmtEuro(invoices.reduce((s, i) => s + i.total_cents, 0))}</span>
        </div>
      )}

      {/* Paginering */}
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
