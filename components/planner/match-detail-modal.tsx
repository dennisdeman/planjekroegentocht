"use client";

import { useEffect, useState } from "react";
import type { MatchResult, MatchStatus, MatchCancelReason, Id, GroupV2, StationV2, LocationV2, ActivityTypeV2, TimeslotV2 } from "@core";

interface MatchDetailModalProps {
  kroegentochtId: string;
  match: MatchResult;
  config: { timeslots: TimeslotV2[] };
  activeTimeslots: TimeslotV2[];
  groupById: Map<Id, GroupV2>;
  stationById: Map<Id, StationV2>;
  locationById: Map<Id, LocationV2>;
  activityTypeById: Map<Id, ActivityTypeV2>;
  supervisorNames: Record<string, string>;
  stationSupervisors?: Record<string, string[]>;
  onClose: () => void;
  onSaved: () => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return "--:--"; }
}

const STATUS_OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: "scheduled", label: "Ingepland" },
  { value: "in_progress", label: "Bezig" },
  { value: "completed", label: "Gespeeld" },
  { value: "cancelled", label: "Afgelast" },
];

const CANCEL_REASONS: { value: MatchCancelReason; label: string }[] = [
  { value: "weather", label: "Weer" },
  { value: "no_show", label: "Niet opgekomen" },
  { value: "injury", label: "Blessure" },
  { value: "other", label: "Overig" },
];

export function MatchDetailModal({
  kroegentochtId,
  match,
  activeTimeslots,
  groupById,
  stationById,
  locationById,
  activityTypeById,
  supervisorNames,
  stationSupervisors,
  onClose,
  onSaved,
}: MatchDetailModalProps) {
  const [scoreA, setScoreA] = useState<number | "">(match.scoreA ?? "");
  const [scoreB, setScoreB] = useState<number | "">(match.scoreB ?? "");
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [cancelReason, setCancelReason] = useState<MatchCancelReason>(match.cancelReason ?? "other");
  const [cancelNote, setCancelNote] = useState(match.cancelNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeslot = activeTimeslots.find((ts) => ts.index === match.timeslotIndex);
  const station = stationById.get(match.stationId);
  const activity = station ? activityTypeById.get(station.activityTypeId) : undefined;
  const location = station ? locationById.get(station.locationId) : undefined;
  const nameA = groupById.get(match.groupAId)?.name ?? "?";
  const nameB = match.groupBId ? groupById.get(match.groupBId)?.name ?? "?" : null;
  const enteredByName = match.enteredByName
    ?? (match.enteredByTokenId ? supervisorNames[match.enteredByTokenId] ?? null : null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    let finalStatus = status;
    const numA = typeof scoreA === "number" ? scoreA : null;
    const numB = typeof scoreB === "number" ? scoreB : null;
    if ((finalStatus === "scheduled" || finalStatus === "in_progress") && numA !== null && numB !== null) {
      finalStatus = "completed";
    }

    try {
      const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          scoreA: finalStatus === "cancelled" ? null : numA,
          scoreB: finalStatus === "cancelled" ? null : numB,
          status: finalStatus,
          cancelReason: finalStatus === "cancelled" ? cancelReason : null,
          cancelNote: finalStatus === "cancelled" ? cancelNote || null : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Opslaan mislukt.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opslaan mislukt.");
      setSaving(false);
    }
  }

  return (
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="help-modal-card" style={{ width: "min(480px, 100%)" }}>
        <div className="help-modal-header" style={{ marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Wedstrijd detail</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Ronde {(match.timeslotIndex) + 1}
              {timeslot ? ` · ${formatTime(timeslot.start)} – ${formatTime(timeslot.end)}` : ""}
            </p>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} disabled={saving}>Sluiten</button>
        </div>

        <div className="muted" style={{ fontSize: "0.82rem", marginBottom: 12 }}>
          {activity?.name ?? station?.name ?? "?"} @ {location?.name ?? "?"}
          {(() => {
            const names = stationSupervisors?.[match.stationId];
            if (!names || names.length === 0) return null;
            return <> · Begeleider{names.length > 1 ? "s" : ""}: <strong>{names.join(", ")}</strong></>;
          })()}
        </div>

        {nameB ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{nameA}</div>
              {status !== "cancelled" && (
                <input
                  type="number"
                  min={0}
                  value={scoreA}
                  onChange={(e) => setScoreA(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                  style={{ width: 60, textAlign: "center", fontSize: "1.1rem", fontWeight: 600 }}
                  disabled={saving}
                />
              )}
            </div>
            <span className="muted" style={{ fontSize: "0.9rem" }}>vs</span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{nameB}</div>
              {status !== "cancelled" && (
                <input
                  type="number"
                  min={0}
                  value={scoreB}
                  onChange={(e) => setScoreB(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                  style={{ width: 60, textAlign: "center", fontSize: "1.1rem", fontWeight: 600 }}
                  disabled={saving}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="muted" style={{ marginBottom: 16 }}>bye · {nameA}</div>
        )}

        {nameB && (
          <>
            <div style={{ marginBottom: 12 }}>
              <span className="muted" style={{ fontSize: "0.78rem", display: "block", marginBottom: 4 }}>Status</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STATUS_OPTIONS.map((opt) => (
                  <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.85rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="match-status"
                      checked={status === opt.value}
                      onChange={() => setStatus(opt.value)}
                      disabled={saving}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {status === "cancelled" && (
              <div style={{ display: "grid", gap: 8, marginBottom: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Reden</span>
                  <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value as MatchCancelReason)} disabled={saving}>
                    {CANCEL_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Toelichting (optioneel)</span>
                  <textarea
                    value={cancelNote}
                    onChange={(e) => setCancelNote(e.target.value.slice(0, 400))}
                    rows={2}
                    style={{ resize: "vertical" }}
                    disabled={saving}
                  />
                </label>
              </div>
            )}
          </>
        )}

        {(enteredByName || match.enteredAt) && (
          <div className="muted" style={{ fontSize: "0.78rem", marginBottom: 12 }}>
            {enteredByName && <>Ingevoerd door: <strong>{enteredByName}</strong></>}
            {match.enteredAt && <>{enteredByName ? " · " : "Ingevoerd: "}{formatTime(match.enteredAt)}</>}
          </div>
        )}

        <MatchHistory kroegentochtId={kroegentochtId} matchId={match.id} supervisorNames={supervisorNames} />

        {error && (
          <div className="notice notice-error" style={{ marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>{error}</p>
          </div>
        )}

        {nameB && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Annuleren</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Opslaan..." : "Opslaan"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface HistoryEntry {
  id: string;
  oldScoreA: number | null;
  oldScoreB: number | null;
  newScoreA: number | null;
  newScoreB: number | null;
  oldStatus: string;
  newStatus: string;
  changedByTokenId: string | null;
  changedByUserId: string | null;
  changedByName: string | null;
  changedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Ingepland",
  in_progress: "Bezig",
  completed: "Gespeeld",
  cancelled: "Afgelast",
};

function MatchHistory({ kroegentochtId, matchId, supervisorNames }: {
  kroegentochtId: string;
  matchId: string;
  supervisorNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || entries !== null) return;
    setLoading(true);
    fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/match/${encodeURIComponent(matchId)}/log`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.history ?? []);
        if (d.supervisorNames) {
          Object.assign(supervisorNames, d.supervisorNames);
        }
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, entries, kroegentochtId, matchId, supervisorNames]);

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.78rem", color: "var(--brand, #4A90E2)", padding: 0 }}
      >
        {open ? "▾ Geschiedenis verbergen" : "▸ Geschiedenis"}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          {loading && <p className="muted" style={{ fontSize: "0.78rem" }}>Laden...</p>}
          {entries && entries.length === 0 && <p className="muted" style={{ fontSize: "0.78rem" }}>Nog geen wijzigingen.</p>}
          {entries && entries.length > 0 && (
            <div style={{ display: "grid", gap: 4 }}>
              {entries.map((e) => {
                const time = formatTime(e.changedAt);
                const who = e.changedByName
                  ?? (e.changedByTokenId ? supervisorNames[e.changedByTokenId] ?? "Spelbegeleider" : null)
                  ?? (e.changedByUserId ? "Beheerder" : "Onbekend");

                const scoreChanged = e.oldScoreA !== e.newScoreA || e.oldScoreB !== e.newScoreB;
                const statusChanged = e.oldStatus !== e.newStatus;

                const parts: string[] = [];
                if (scoreChanged) {
                  const oldScore = e.oldScoreA !== null && e.oldScoreB !== null ? `${e.oldScoreA}-${e.oldScoreB}` : "–";
                  const newScore = e.newScoreA !== null && e.newScoreB !== null ? `${e.newScoreA}-${e.newScoreB}` : "–";
                  parts.push(`${oldScore} → ${newScore}`);
                }
                if (statusChanged) {
                  parts.push(`${STATUS_LABELS[e.oldStatus] ?? e.oldStatus} → ${STATUS_LABELS[e.newStatus] ?? e.newStatus}`);
                }

                return (
                  <div key={e.id} style={{ fontSize: "0.76rem", color: "var(--muted, #6b7280)" }}>
                    <strong>{time}</strong> {who}: {parts.join(" · ") || "Geen wijziging"}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
