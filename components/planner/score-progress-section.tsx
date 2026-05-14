"use client";

import { useEffect, useState } from "react";

interface StationStat {
  stationId: string;
  label: string;
  total: number;
  completed: number;
  cancelled: number;
  pending: number;
  lastActivity: string | null;
}

interface MonitorData {
  totalMatches: number;
  totalCompleted: number;
  totalCancelled: number;
  stations: StationStat[];
}

function fmtTimeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "zojuist";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min geleden`;
  const hr = Math.floor(min / 60);
  return `${hr}u ${min % 60}m geleden`;
}

interface ScoreProgressSectionProps {
  kroegentochtId: string;
}

export function ScoreProgressSection({ kroegentochtId }: ScoreProgressSectionProps) {
  const [stats, setStats] = useState<MonitorData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = () => {
      fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/monitor`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled && d.stations) setStats(d); })
        .catch(() => {});
    };
    fetchStats();
    const id = setInterval(fetchStats, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [kroegentochtId]);

  if (!stats) {
    return (
      <section className="card" style={{ marginTop: 12 }}>
        <p className="muted" style={{ textAlign: "center", padding: 20 }}>Voortgang laden...</p>
      </section>
    );
  }

  const overallPct = stats.totalMatches > 0 ? Math.round((stats.totalCompleted / stats.totalMatches) * 100) : 0;
  const allDone = stats.totalMatches > 0 && stats.totalCompleted + stats.totalCancelled >= stats.totalMatches;

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <h3 style={{ margin: "0 0 12px" }}>Score-invoer voortgang</h3>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--line)", overflow: "hidden" }}>
          <div style={{ width: `${overallPct}%`, height: "100%", borderRadius: 5, background: allDone ? "var(--success, #16a34a)" : "var(--brand)", transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: "0.92rem", fontWeight: 700, flexShrink: 0 }}>
          {overallPct}%
        </span>
      </div>
      <div className="muted" style={{ fontSize: "0.82rem", marginBottom: 16 }}>
        {stats.totalCompleted} van {stats.totalMatches} spelletjes gescoord
        {stats.totalCancelled > 0 ? ` · ${stats.totalCancelled} afgelast` : ""}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {stats.stations.map((s) => {
          const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
          const stationDone = s.total > 0 && s.completed + s.cancelled >= s.total;
          const lagging = !stationDone && pct < overallPct && s.pending > 0;

          return (
            <div
              key={s.stationId}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: stationDone
                  ? "rgba(22, 163, 74, 0.04)"
                  : lagging
                    ? "rgba(220, 38, 38, 0.04)"
                    : "transparent",
              }}
            >
              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  {lagging && <span style={{ color: "var(--error, #dc2626)", marginRight: 6 }}>●</span>}
                  {stationDone && <span style={{ color: "var(--success, #16a34a)", marginRight: 6 }}>✓</span>}
                  {s.label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                  <div style={{ flex: 1, maxWidth: 160, height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: stationDone ? "var(--success, #16a34a)" : lagging ? "var(--error, #dc2626)" : "var(--brand)",
                      transition: "width 0.3s",
                    }} />
                  </div>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {s.completed}/{s.total}
                    {s.cancelled > 0 ? ` (${s.cancelled} afgelast)` : ""}
                  </span>
                </div>
              </div>
              <span className="muted" style={{ fontSize: "0.76rem", textAlign: "right", whiteSpace: "nowrap" }}>
                {s.lastActivity ? fmtTimeAgo(s.lastActivity) : "Nog geen invoer"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
