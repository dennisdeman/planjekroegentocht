"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchResult, MatchCancelReason, TimeslotV2 } from "@core";

interface RoundColumnMenuProps {
  kroegentochtId: string;
  timeslotIndex: number;
  anchor: DOMRect;
  matches: MatchResult[];
  activeTimeslots: TimeslotV2[];
  onBulkAction: (action: string, timeslotIndex: number, cancelReason?: string) => Promise<void>;
  onClose: () => void;
}

const CANCEL_REASONS: { value: MatchCancelReason; label: string }[] = [
  { value: "weather", label: "Weer" },
  { value: "no_show", label: "Niet opgekomen" },
  { value: "injury", label: "Blessure" },
  { value: "other", label: "Overig" },
];

export function RoundColumnMenu({
  timeslotIndex,
  anchor,
  matches,
  activeTimeslots,
  onBulkAction,
  onClose,
}: RoundColumnMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "restore" | null>(null);
  const [cancelReason, setCancelReason] = useState<MatchCancelReason>("other");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const roundMatches = matches.filter((m) => m.timeslotIndex === timeslotIndex && m.groupBId !== null);
  const cancellable = roundMatches.filter((m) => m.status !== "cancelled");
  const restorable = roundMatches.filter((m) => m.status === "cancelled");

  const ts = activeTimeslots.find((t) => t.index === timeslotIndex);
  const label = ts ? `Ronde ${timeslotIndex + 1}` : `Ronde ${timeslotIndex + 1}`;

  async function handleConfirm() {
    setLoading(true);
    try {
      if (confirmAction === "cancel") {
        await onBulkAction("cancel_round", timeslotIndex, cancelReason);
      } else if (confirmAction === "restore") {
        await onBulkAction("restore_round", timeslotIndex);
      }
    } finally {
      setLoading(false);
    }
  }

  const top = anchor.bottom + 6;
  const left = Math.max(8, anchor.left + anchor.width / 2 - 160);

  if (confirmAction) {
    const count = confirmAction === "cancel" ? cancellable.length : restorable.length;
    return (
      <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="help-modal-card" style={{ width: "min(420px, 100%)" }}>
          <div className="help-modal-header" style={{ marginBottom: 10 }}>
            <h3>{confirmAction === "cancel" ? "Ronde afgelasten" : "Ronde heropenen"}</h3>
            <button type="button" className="btn-ghost btn-sm" onClick={onClose} disabled={loading}>Sluiten</button>
          </div>

          {confirmAction === "cancel" ? (
            <>
              <p style={{ fontSize: "0.88rem", lineHeight: 1.5, margin: "0 0 12px" }}>
                Dit annuleert <strong>{count} wedstrijd{count !== 1 ? "en" : ""}</strong> in {label}.
                Scores die al ingevoerd zijn worden bewaard maar de wedstrijden worden gemarkeerd als afgelast.
              </p>
              <label style={{ display: "grid", gap: 4, marginBottom: 12 }}>
                <span className="muted" style={{ fontSize: "0.78rem" }}>Reden</span>
                <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value as MatchCancelReason)} disabled={loading}>
                  {CANCEL_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
            </>
          ) : (
            <p style={{ fontSize: "0.88rem", lineHeight: 1.5, margin: "0 0 12px" }}>
              Dit herstelt <strong>{count} afgelaste wedstrijd{count !== 1 ? "en" : ""}</strong> in {label} naar &apos;ingepland&apos;.
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn-ghost" onClick={() => setConfirmAction(null)} disabled={loading}>Terug</button>
            <button
              type="button"
              className={confirmAction === "cancel" ? "btn-primary" : "btn-primary"}
              style={confirmAction === "cancel" ? { background: "var(--error, #dc2626)" } : {}}
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? "Bezig..." : confirmAction === "cancel" ? `Ja, annuleer ${count} wedstrijden` : `Herstel ${count} wedstrijden`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 1000,
        width: 220,
        background: "var(--card, #fff)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: "6px 0",
        fontSize: "0.85rem",
      }}
    >
      <div style={{ padding: "6px 14px", fontWeight: 600, fontSize: "0.82rem" }} className="muted">{label}</div>
      {cancellable.length > 0 && (
        <button
          type="button"
          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", border: "none", background: "none", cursor: "pointer", fontSize: "0.85rem" }}
          onClick={() => setConfirmAction("cancel")}
          onMouseOver={(e) => { (e.target as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
          onMouseOut={(e) => { (e.target as HTMLElement).style.background = "none"; }}
        >
          Hele ronde afgelasten ({cancellable.length})
        </button>
      )}
      {restorable.length > 0 && (
        <button
          type="button"
          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", border: "none", background: "none", cursor: "pointer", fontSize: "0.85rem" }}
          onClick={() => setConfirmAction("restore")}
          onMouseOver={(e) => { (e.target as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
          onMouseOut={(e) => { (e.target as HTMLElement).style.background = "none"; }}
        >
          Ronde heropenen ({restorable.length})
        </button>
      )}
      {cancellable.length === 0 && restorable.length === 0 && (
        <div style={{ padding: "8px 14px" }} className="muted">Geen acties beschikbaar</div>
      )}
    </div>
  );
}
