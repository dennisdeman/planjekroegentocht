"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MatchResult } from "@core";

interface MatchConfig {
  groups: Array<{ id: string; name: string }>;
  stations: Array<{ id: string; locationId: string; activityTypeId: string }>;
  locations: Array<{ id: string; name: string }>;
  activityTypes: Array<{ id: string; name: string }>;
  timeslots: Array<{ id: string; index: number; start: string; end: string; kind: string }>;
}

interface ScoreCorrectionModalProps {
  kroegentochtId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export function ScoreCorrectionModal({ kroegentochtId, open, onClose, onSaved }: ScoreCorrectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [config, setConfig] = useState<MatchConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MatchResult | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/matches`)
      .then((r) => r.json())
      .then((d) => {
        setMatches(d.matches ?? []);
        setConfig(d.config ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, kroegentochtId]);

  const groupById = useMemo(() => new Map((config?.groups ?? []).map((g) => [g.id, g.name])), [config]);

  const stationLabel = (stationId: string) => {
    const st = config?.stations.find((s) => s.id === stationId);
    if (!st) return stationId;
    const loc = config?.locations.find((l) => l.id === st.locationId);
    const act = config?.activityTypes.find((a) => a.id === st.activityTypeId);
    return `${act?.name ?? "Spel"} @ ${loc?.name ?? "Veld"}`;
  };

  const activeTimeslots = useMemo(
    () => (config?.timeslots ?? []).filter((t) => t.kind === "active").sort((a, b) => a.index - b.index),
    [config]
  );

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { setEditing(null); onClose(); } }}>
      <div className="help-modal-card" style={{ width: "min(640px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
        <div className="help-modal-header" style={{ marginBottom: 14 }}>
          <h3>{editing ? "Score aanpassen" : "Alle wedstrijden"}</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={() => { if (editing) setEditing(null); else onClose(); }}>
            {editing ? "Terug" : "Sluiten"}
          </button>
        </div>

        {loading && <p className="muted">Laden...</p>}

        {!loading && !editing && (
          <div style={{ display: "grid", gap: 8 }}>
            {activeTimeslots.map((slot, i) => {
              const slotMatches = matches.filter((m) => m.timeslotIndex === slot.index).sort((a, b) => stationLabel(a.stationId).localeCompare(stationLabel(b.stationId)));
              if (slotMatches.length === 0) return null;
              return (
                <div key={slot.id}>
                  <div className="muted" style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>
                    Ronde {i + 1} · {fmtTime(slot.start)} – {fmtTime(slot.end)}
                  </div>
                  {slotMatches.map((m) => {
                    const gA = groupById.get(m.groupAId) ?? m.groupAId;
                    const gB = m.groupBId ? (groupById.get(m.groupBId) ?? m.groupBId) : null;
                    const scoreText = m.status === "completed" && m.scoreA != null && m.scoreB != null
                      ? `${m.scoreA} – ${m.scoreB}`
                      : m.status === "cancelled" ? "afgelast" : "–";
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setEditing(m)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 8,
                          alignItems: "center",
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 5,
                          border: "1px solid var(--line)",
                          background: "transparent",
                          textAlign: "left",
                          cursor: "pointer",
                          marginBottom: 4,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                            {gA}{gB && <> <span className="muted">vs</span> {gB}</>}
                          </div>
                          <div className="muted" style={{ fontSize: "0.72rem" }}>{stationLabel(m.stationId)}</div>
                        </div>
                        <strong style={{ fontVariantNumeric: "tabular-nums", color: m.status === "completed" ? "var(--text)" : "var(--muted)" }}>
                          {scoreText}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {!loading && editing && (
          <EditMatchForm
            kroegentochtId={kroegentochtId}
            match={editing}
            groupById={groupById}
            stationLabel={stationLabel(editing.stationId)}
            onSaved={async () => {
              try {
                const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/matches`);
                const d = await res.json();
                setMatches(d.matches ?? []);
              } catch {}
              setEditing(null);
              onSaved();
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

function EditMatchForm({
  kroegentochtId,
  match,
  groupById,
  stationLabel,
  onSaved,
}: {
  kroegentochtId: string;
  match: MatchResult;
  groupById: Map<string, string>;
  stationLabel: string;
  onSaved: () => void;
}) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? 0);
  const [scoreB, setScoreB] = useState(match.scoreB ?? 0);
  const [status, setStatus] = useState(match.status);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameA = groupById.get(match.groupAId) ?? match.groupAId;
  const nameB = match.groupBId ? (groupById.get(match.groupBId) ?? match.groupBId) : null;

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    // Auto-promote naar "completed" als scores zijn ingevuld en status nog scheduled/in_progress
    const effectiveStatus = (status === "scheduled" || status === "in_progress") && nameB && (scoreA > 0 || scoreB > 0)
      ? "completed"
      : status;
    try {
      const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/match`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          scoreA: effectiveStatus === "cancelled" ? null : scoreA,
          scoreB: effectiveStatus === "cancelled" ? null : scoreB,
          status: effectiveStatus,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Opslaan mislukt.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <strong style={{ fontSize: "1rem" }}>{nameA}{nameB && <> vs {nameB}</>}</strong>
        <div className="muted" style={{ fontSize: "0.85rem" }}>{stationLabel}</div>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: "0.78rem" }}>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="scheduled">Ingepland</option>
          <option value="in_progress">Bezig</option>
          <option value="completed">Afgerond</option>
          <option value="cancelled">Afgelast</option>
        </select>
      </label>

      {status !== "cancelled" && nameB && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>{nameA}</span>
            <input type="number" min={0} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value) || 0)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>{nameB}</span>
            <input type="number" min={0} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value) || 0)} />
          </label>
        </div>
      )}

      {error && (
        <div className="notice notice-error">
          <p style={{ margin: 0, fontSize: "0.88rem" }}>{error}</p>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={submitting}>
          {submitting ? "Bezig..." : "Opslaan"}
        </button>
      </div>
    </div>
  );
}
