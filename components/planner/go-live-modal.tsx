"use client";

import { useState } from "react";
import type { LiveConfig } from "@core";
import { DEFAULT_LIVE_CONFIG } from "@core";

interface GoLiveModalProps {
  open: boolean;
  initialConfig?: LiveConfig;
  firstSlotStartIso?: string | null;
  onCancel: () => void;
  onConfirm: (config: LiveConfig, startMode: "scheduled" | "now", scheduledDatetime?: string, adminName?: string, photosEnabled?: boolean) => Promise<void>;
}

function scheduledTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function defaultScheduledDatetime(iso: string | null | undefined): string {
  const now = new Date();
  const todayPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  let hour: number;
  let minute: number;
  if (!iso) {
    hour = 9;
    minute = 0;
  } else {
    const slotTime = new Date(iso);
    hour = slotTime.getHours();
    minute = slotTime.getMinutes();
  }

  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  if (candidate.getTime() < now.getTime()) {
    const nextHour = now.getHours() + 1;
    hour = nextHour;
    minute = 0;
  }

  return `${todayPrefix}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function GoLiveModal({ open, initialConfig, firstSlotStartIso, onCancel, onConfirm }: GoLiveModalProps) {
  const [config, setConfig] = useState<LiveConfig>(initialConfig ?? DEFAULT_LIVE_CONFIG);
  const defaultDt = defaultScheduledDatetime(firstSlotStartIso);
  const scheduledInPast = new Date(defaultDt).getTime() < Date.now();
  const [startMode, setStartMode] = useState<"scheduled" | "now">(scheduledInPast ? "now" : "scheduled");
  const [scheduledDatetime, setScheduledDatetime] = useState(defaultDt);
  const [adminName, setAdminName] = useState("");
  const [photosEnabled, setPhotosEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheduledLabel = scheduledTimeLabel(firstSlotStartIso);

  if (!open) return null;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(config, startMode, startMode === "scheduled" ? scheduledDatetime : undefined, adminName.trim() || undefined, photosEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kon niet live zetten.");
      setSubmitting(false);
    }
  }

  return (
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="help-modal-card" style={{ width: "min(520px, 100%)" }}>
        <div className="help-modal-header" style={{ marginBottom: 14 }}>
          <h3>Kroegentocht genereren</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={submitting}>Sluiten</button>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: "0.9rem", lineHeight: 1.5 }}>
          Er wordt een kroegentocht aangemaakt op basis van je huidige planning. Spelbegeleiders kunnen dan scores invoeren en
          deelnemers en ouders kunnen het programma en scorebord volgen via gedeelde links. Je planning blijft bewerkbaar.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Je naam</span>
            <span className="muted" style={{ fontSize: "0.78rem" }}>Zichtbaar in berichten naar spelbegeleiders. Laat leeg voor "Beheerder".</span>
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value.slice(0, 100))}
              placeholder="Beheerder"
              style={{ maxWidth: 280 }}
            />
          </label>

          <h4 style={{ margin: "4px 0 0", fontSize: "0.95rem" }}>Starttijd</h4>
          <div style={{ display: "grid", gap: 10, marginBottom: 8 }}>
            <div>
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}
                onClick={() => setStartMode("scheduled")}
              >
                <input type="radio" name="startMode" checked={startMode === "scheduled"} onChange={() => setStartMode("scheduled")} />
                <span>Op gepland tijdstip{scheduledLabel && ` (${scheduledLabel})`}</span>
              </div>
              {startMode === "scheduled" && (
                <input
                  type="datetime-local"
                  value={scheduledDatetime}
                  onChange={(e) => setScheduledDatetime(e.target.value)}
                  style={{ marginTop: 6, marginLeft: 24, width: "auto", maxWidth: 220 }}
                />
              )}
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}
              onClick={() => setStartMode("now")}
            >
              <input type="radio" name="startMode" checked={startMode === "now"} onChange={() => setStartMode("now")} />
              <span>Nu meteen starten</span>
            </div>
          </div>

          <h4 style={{ margin: "4px 0 0", fontSize: "0.95rem" }}>Puntensysteem</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 2 }}>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Winst</span>
              <input
                type="number" min={0} value={config.pointsWin}
                onChange={(e) => setConfig({ ...config, pointsWin: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label style={{ display: "grid", gap: 2 }}>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Gelijk</span>
              <input
                type="number" min={0} value={config.pointsDraw}
                onChange={(e) => setConfig({ ...config, pointsDraw: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label style={{ display: "grid", gap: 2 }}>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Verlies</span>
              <input
                type="number" min={0} value={config.pointsLoss}
                onChange={(e) => setConfig({ ...config, pointsLoss: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>Scoretype</span>
            <select
              value={config.scoring}
              onChange={(e) => setConfig({ ...config, scoring: e.target.value as LiveConfig["scoring"] })}
            >
              <option value="win_loss">Winst/gelijk/verlies</option>
              <option value="goals_plus_win">Winst + doelpunten tellen mee</option>
              <option value="ranking_only">Alleen rangorde (estafette-modus)</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>Bij pauze/bye</span>
            <select
              value={config.byePolicy}
              onChange={(e) => setConfig({ ...config, byePolicy: e.target.value as LiveConfig["byePolicy"] })}
            >
              <option value="no_points_no_average">Geen punten, telt niet mee</option>
              <option value="average_of_played">Gemiddelde van eigen scores</option>
            </select>
          </label>

          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}
            onClick={() => setConfig({ ...config, showScoresOnProgram: !config.showScoresOnProgram })}
          >
            <input
              type="checkbox"
              checked={config.showScoresOnProgram}
              onChange={(e) => setConfig({ ...config, showScoresOnProgram: e.target.checked })}
            />
            <span>Scores tonen op publiek programma</span>
          </div>

          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}
            onClick={() => setPhotosEnabled(!photosEnabled)}
          >
            <input
              type="checkbox"
              checked={photosEnabled}
              onChange={(e) => setPhotosEnabled(e.target.checked)}
            />
            <span>Spelbegeleiders mogen foto&apos;s delen</span>
          </div>
        </div>

        {error && (
          <div className="notice notice-error" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>{error}</p>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
            Annuleren
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Bezig..." : "Genereer kroegentocht"}
          </button>
        </div>
      </div>
    </div>
  );
}
