"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { KroegentochtListItem } from "@lib/kroegentochten/api";
import { confirmDialog, alertDialog } from "@ui/ui/confirm-dialog";

interface DeletedItem {
  id: string;
  name: string;
  deletedAt: string;
  liveCompletedAt: string | null;
}

export default function KroegentochtenPage() {
  const [items, setItems] = useState<KroegentochtListItem[]>([]);
  const [deleted, setDeleted] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [trashOpen, setTrashOpen] = useState(false);

  function refresh() {
    fetch("/api/kroegentochten")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setDeleted(d.deleted ?? []);
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetch("/api/kroegentochten")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setDeleted(d.deleted ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const live = items.filter((i) => i.liveStatus === "live");
  const completed = items.filter((i) => i.liveStatus === "completed");

  if (loading) {
    return (
      <div className="planner-page" style={{ display: "grid", placeItems: "center", minHeight: 200 }}>
        <p className="muted">Laden...</p>
      </div>
    );
  }

  return (
    <div className="planner-page">
      <section className="card">
        <header className="planner-header">
          <div>
            <h2>Kroegentochten</h2>
            <p className="muted" style={{ margin: 0 }}>
              Beheer je actieve en afgeronde kroegentochten
            </p>
          </div>
        </header>
      </section>

      {items.length === 0 && (
        <section className="card empty-state">
          <h3>Nog geen kroegentochten</h3>
          <p>Maak een planning in de planner en klik op &ldquo;Genereer kroegentocht&rdquo; om je eerste kroegentocht aan te maken.</p>
          <div className="inline-actions" style={{ justifyContent: "center" }}>
            <Link href="/planner" className="button-link btn-primary">
              Naar planner
            </Link>
          </div>
        </section>
      )}

      {live.length > 0 && (
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ margin: "0 0 10px" }}>Live kroegentochten</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {live.map((item) => (
              <KroegentochtCard key={item.id} item={item} onDeleted={refresh} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ margin: "0 0 10px" }}>Afgeronde kroegentochten</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {completed.map((item) => (
              <KroegentochtCard key={item.id} item={item} onDeleted={refresh} />
            ))}
          </div>
        </section>
      )}

      {deleted.length > 0 && (
        <section className="card" style={{ padding: 16 }}>
          <button
            type="button"
            onClick={() => setTrashOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              width: "100%",
            }}
          >
            <h3 style={{ margin: 0 }}>Prullenbak ({deleted.length})</h3>
            <span className="muted" style={{ fontSize: "0.78rem" }}>
              {trashOpen ? "▲" : "▼"}
            </span>
          </button>
          {trashOpen && (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                  Verwijderde kroegentochten worden na 30 dagen automatisch definitief verwijderd.
                </p>
                <button
                  type="button"
                  className="btn-sm danger-button"
                  onClick={async () => {
                    if (!(await confirmDialog({ title: "Prullenbak leegmaken", message: `${deleted.length} kroegentocht${deleted.length === 1 ? "" : "en"} en alle bijbehorende scores worden definitief verwijderd. Dit kan niet ongedaan worden.`, confirmLabel: "Leegmaken", variant: "danger" }))) return;
                    try {
                      const res = await fetch("/api/kroegentochten/trash", { method: "DELETE" });
                      if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        void alertDialog({ message: body.error ?? "Legen mislukt.", variant: "error" });
                        return;
                      }
                      refresh();
                    } catch {
                      void alertDialog({ message: "Legen mislukt.", variant: "error" });
                    }
                  }}
                >
                  Prullenbak leegmaken
                </button>
              </div>
              {deleted.map((item) => {
                const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(item.deletedAt).getTime()) / 86_400_000));
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      opacity: 0.7,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{item.name}</div>
                      <div className="muted" style={{ fontSize: "0.78rem" }}>
                        Verwijderd {new Date(item.deletedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}
                        {" · "}{daysLeft} {daysLeft === 1 ? "dag" : "dagen"} resterend
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn-sm btn-ghost"
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/kroegentochten/${encodeURIComponent(item.id)}`, {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ action: "restore" }),
                            });
                            if (!res.ok) {
                              const body = await res.json().catch(() => ({}));
                              void alertDialog({ message: body.error ?? "Herstellen mislukt.", variant: "error" });
                              return;
                            }
                            refresh();
                          } catch {
                            void alertDialog({ message: "Herstellen mislukt.", variant: "error" });
                          }
                        }}
                      >
                        Herstellen
                      </button>
                      <button
                        type="button"
                        className="btn-sm danger-button"
                        onClick={async () => {
                          if (!(await confirmDialog({ title: "Definitief verwijderen", message: `"${item.name}" en alle bijbehorende scores en links worden permanent verwijderd.`, confirmLabel: "Definitief verwijderen", variant: "danger" }))) return;
                          try {
                            const res = await fetch(`/api/kroegentochten/${encodeURIComponent(item.id)}`, {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ action: "permanent-delete" }),
                            });
                            if (!res.ok) {
                              const body = await res.json().catch(() => ({}));
                              void alertDialog({ message: body.error ?? "Verwijderen mislukt.", variant: "error" });
                              return;
                            }
                            refresh();
                          } catch {
                            void alertDialog({ message: "Verwijderen mislukt.", variant: "error" });
                          }
                        }}
                      >
                        Definitief verwijderen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function KroegentochtCard({ item, onDeleted }: { item: KroegentochtListItem; onDeleted: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const programUrl = item.programToken ? `${origin}/live/${item.id}/program/${item.programToken}` : null;
  const scoreboardUrl = item.scoreboardToken ? `${origin}/live/${item.id}/scoreboard/${item.scoreboardToken}` : null;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        border: "1px solid var(--line)",
        borderRadius: 6,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {item.liveStatus === "live" && (() => {
            const scheduled = item.liveStartedAt && new Date(item.liveStartedAt).getTime() > Date.now();
            const afterLast = !scheduled && item.effectiveEndAt && new Date(item.effectiveEndAt).getTime() < Date.now();
            const color = scheduled ? "#f97316" : afterLast ? "#9ca3af" : "#22c55e";
            const shadow = scheduled ? "0 0 6px rgba(249, 115, 22, 0.5)" : afterLast ? "none" : "0 0 6px rgba(34, 197, 94, 0.5)";
            return (
              <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: color, boxShadow: shadow }} />
            );
          })()}
          <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>{item.name}</span>
        </div>
        <div className="muted" style={{ fontSize: "0.78rem" }}>
          {item.liveStatus === "completed" && item.liveCompletedAt
            ? `Afgerond ${new Date(item.liveCompletedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}`
            : item.liveStartedAt && new Date(item.liveStartedAt).getTime() > Date.now()
              ? `Start op: ${new Date(item.liveStartedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })} om ${new Date(item.liveStartedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
              : item.effectiveEndAt && new Date(item.effectiveEndAt).getTime() < Date.now()
                ? "Afgelopen — wacht op afronden"
                : item.liveStartedAt
                  ? `Live sinds ${new Date(item.liveStartedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Link href={`/kroegentochten/${item.id}`} className="button-link btn-sm btn-primary">
          Beheren
        </Link>
        {scoreboardUrl && (
          <a href={scoreboardUrl} target="_blank" rel="noopener noreferrer" className="button-link btn-sm btn-ghost">
            Scorebord
          </a>
        )}
        {programUrl && (
          <a href={programUrl} target="_blank" rel="noopener noreferrer" className="button-link btn-sm btn-ghost">
            Programma
          </a>
        )}
        {item.liveStatus !== "live" && (
          <button
            type="button"
            className="btn-sm danger-button"
            onClick={async () => {
              if (!(await confirmDialog({ title: "Kroegentocht verwijderen", message: `"${item.name}" en alle bijbehorende scores en links worden verwijderd.`, confirmLabel: "Verwijderen", variant: "danger" }))) return;
              try {
                const res = await fetch(`/api/kroegentochten/${encodeURIComponent(item.id)}`, { method: "DELETE" });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  void alertDialog({ message: body.error ?? "Verwijderen mislukt.", variant: "error" });
                  return;
                }
                onDeleted();
              } catch {
                void alertDialog({ message: "Verwijderen mislukt.", variant: "error" });
              }
            }}
          >
            Verwijder
          </button>
        )}
      </div>
    </div>
  );
}
