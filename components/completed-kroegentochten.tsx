"use client";

import { useEffect, useState } from "react";

interface CompletedItem {
  id: string;
  name: string;
  liveCompletedAt: string | null;
  programToken: string | null;
  scoreboardToken: string | null;
}

export function CompletedKroegentochten() {
  const [items, setItems] = useState<CompletedItem[]>([]);

  useEffect(() => {
    fetch("/api/kroegentochten")
      .then((r) => r.json())
      .then((d) => {
        const completed = (d.items ?? []).filter((i: { liveStatus: string }) => i.liveStatus === "completed");
        setItems(completed);
      })
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="card" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 10px" }}>Afgeronde kroegentochten</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => {
          const programUrl = item.programToken ? `${origin}/live/${item.id}/program/${item.programToken}` : null;
          const scoreboardUrl = item.scoreboardToken ? `${origin}/live/${item.id}/scoreboard/${item.scoreboardToken}` : null;
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
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{item.name}</div>
                <div className="muted" style={{ fontSize: "0.78rem" }}>
                  {item.liveCompletedAt
                    ? `Afgerond ${new Date(item.liveCompletedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}`
                    : "Afgerond"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <a href={`/kroegentochten/${item.id}`} className="button-link btn-sm btn-ghost">
                  Beheren
                </a>
                {scoreboardUrl && (
                  <a href={scoreboardUrl} target="_blank" rel="noopener noreferrer" className="button-link btn-sm btn-ghost" style={{ gap: 4 }}>
                    Scorebord
                  </a>
                )}
                {programUrl && (
                  <a href={programUrl} target="_blank" rel="noopener noreferrer" className="button-link btn-sm btn-ghost" style={{ gap: 4 }}>
                    Programma
                  </a>
                )}
                {(programUrl || scoreboardUrl) && (
                  <button
                    type="button"
                    className="btn-sm btn-ghost"
                    onClick={async () => {
                      const url = scoreboardUrl ?? programUrl ?? "";
                      if (typeof navigator.share === "function") {
                        try { await navigator.share({ title: item.name, url }); return; } catch {}
                      }
                      try { await navigator.clipboard.writeText(url); } catch {}
                    }}
                  >
                    Deel link
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
