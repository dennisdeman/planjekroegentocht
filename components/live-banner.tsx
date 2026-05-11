"use client";

import { useEffect, useState } from "react";

interface LiveInfo {
  kroegentochtId: string;
  name: string;
  liveStartedAt: string | null;
  effectiveEndAt: string | null;
}

export function LiveBanner() {
  const [info, setInfo] = useState<LiveInfo | null>(null);

  useEffect(() => {
    fetch("/api/kroegentochten")
      .then((r) => r.json())
      .then((d) => {
        const live = (d.items ?? []).find((i: { liveStatus: string }) => i.liveStatus === "live");
        if (live) setInfo({ kroegentochtId: live.id, name: live.name, liveStartedAt: live.liveStartedAt, effectiveEndAt: live.effectiveEndAt });
      })
      .catch(() => {});
  }, []);

  if (!info) return null;

  const scheduled = info.liveStartedAt && new Date(info.liveStartedAt).getTime() > Date.now();
  const afterLast = !scheduled && info.effectiveEndAt && new Date(info.effectiveEndAt).getTime() < Date.now();

  const dotColor = scheduled ? "#f97316" : afterLast ? "#9ca3af" : "#22c55e";
  const dotShadow = scheduled ? "0 0 8px rgba(249, 115, 22, 0.5)" : afterLast ? "none" : "0 0 8px rgba(34, 197, 94, 0.5)";
  const label = scheduled
    ? "Kroegentocht gepland · Klik om te beheren"
    : afterLast
      ? "Kroegentocht afgelopen · Klik om af te ronden"
      : "Kroegentocht is live · Klik om te beheren";

  return (
    <a
      href={`/kroegentochten/${info.kroegentochtId}`}
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 18px",
        textDecoration: "none",
      }}
    >
      <div style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: dotColor,
        flexShrink: 0,
        boxShadow: dotShadow,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="muted" style={{ fontSize: "0.78rem" }}>
          {label}
        </div>
        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--accent, #ff6b00)" }}>{info.name}</div>
      </div>
    </a>
  );
}
