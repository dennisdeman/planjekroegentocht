"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import type { LiveConfig } from "@core";
import { DEFAULT_LIVE_CONFIG } from "@core";
import {
  getKroegentochtStatus,
  setKroegentochtStatus,
  updateKroegentochtSettings,
  listKroegentochtTokens,
  regenerateKroegentochtToken,
  revokeKroegentochtToken,
  buildKroegentochtUrl,
  buildMediaUrl,
  type KroegentochtStatusResponse,
  type LiveTokenSlot,
} from "@lib/kroegentochten/api";
import { ScoreCorrectionModal } from "./score-correction-modal";
import { confirmDialog } from "@ui/ui/confirm-dialog";

interface LivePanelProps {
  kroegentochtId: string;
  status: KroegentochtStatusResponse;
  onStatusChange: (status: KroegentochtStatusResponse) => void;
  showMessage: (text: string) => void;
}

function QRImage({ value, size = 128 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1 }, (err) => {
      if (err) console.error("QR render:", err);
    });
  }, [value, size]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius: 4 }} />;
}

function QRPlaceholder({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        border: "1px dashed var(--line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--muted)",
        fontSize: "0.72rem",
        textAlign: "center",
        padding: 6,
        boxSizing: "border-box",
      }}
    >
      Link ingetrokken
    </div>
  );
}

interface LivePhaseInfo {
  phase: string;
  currentRound: number | null;
  totalRounds: number;
  roundEndsAt: string | null;
  nextRoundStartsAt: string | null;
  startedAt: string | null;
}

function isScheduledFuture(status: KroegentochtStatusResponse): boolean {
  return status.status === "live" && !!status.startedAt && new Date(status.startedAt).getTime() > Date.now();
}

function isAfterLast(status: KroegentochtStatusResponse): boolean {
  return status.status === "live" && !isScheduledFuture(status) && !!status.effectiveEndAt && new Date(status.effectiveEndAt).getTime() < Date.now();
}

export function LivePanel({ kroegentochtId, status, onStatusChange, showMessage }: LivePanelProps) {
  const [slots, setSlots] = useState<LiveTokenSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [phaseInfo, setPhaseInfo] = useState<LivePhaseInfo | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, setTick] = useState(0);

  // Tick voor countdown bij geplande kroegentocht
  useEffect(() => {
    if (!isScheduledFuture(status)) return;
    const id = setInterval(() => setTick((n) => (n + 1) % 3600), 1000);
    return () => clearInterval(id);
  }, [status.status, status.startedAt]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (status.status !== "live") { setPhaseInfo(null); return; }
    let cancelled = false;
    const fetchPhase = () => {
      getKroegentochtStatus(kroegentochtId).then((s) => {
        if (cancelled) return;
        const config = s.config;
        setPhaseInfo({
          phase: "live",
          currentRound: null,
          totalRounds: 0,
          roundEndsAt: null,
          nextRoundStartsAt: null,
          startedAt: s.startedAt,
        });
      }).catch(() => {});
    };
    fetchPhase();
    const id = setInterval(fetchPhase, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [status.status, kroegentochtId]);

  useEffect(() => {
    void loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kroegentochtId]);

  async function loadSlots() {
    setLoading(true);
    try {
      const list = await listKroegentochtTokens(kroegentochtId);
      setSlots(list);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "Kon tokens niet laden.");
    } finally {
      setLoading(false);
    }
  }

  function slotKey(slot: Pick<LiveTokenSlot, "role" | "scopeId">) {
    return `${slot.role}|${slot.scopeId ?? ""}`;
  }

  async function handleRegenerate(slot: LiveTokenSlot) {
    const key = slotKey(slot);
    setBusy(key);
    try {
      await regenerateKroegentochtToken(kroegentochtId, slot.role, slot.scopeId);
      await loadSlots();
      showMessage("Nieuwe link gegenereerd. Oude link werkt niet meer.");
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "Kon token niet regenereren.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(slot: LiveTokenSlot) {
    if (!slot.activeToken) return;
    if (!(await confirmDialog({ title: "Link intrekken", message: `Weet je zeker dat je de link voor "${slot.label}" wilt intrekken?`, confirmLabel: "Intrekken", variant: "danger" }))) return;
    const key = slotKey(slot);
    setBusy(key);
    try {
      await revokeKroegentochtToken(kroegentochtId, slot.activeToken.id);
      await loadSlots();
      showMessage("Link ingetrokken.");
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "Kon token niet intrekken.");
    } finally {
      setBusy(null);
    }
  }

  async function handleComplete() {
    if (!(await confirmDialog({ title: "Kroegentocht afronden", message: "Scores blijven bewaard, links blijven 30 dagen actief.", confirmLabel: "Afronden" }))) return;
    setBusy("status");
    try {
      const res = await setKroegentochtStatus(kroegentochtId, "completed");
      onStatusChange({ ...status, status: res.status, completedAt: new Date().toISOString() });
      showMessage("Kroegentocht afgerond.");
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "Kon status niet aanpassen.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReopen() {
    if (!(await confirmDialog({ title: "Kroegentocht heropenen", message: "Bestaande scores blijven bewaard.", confirmLabel: "Heropenen" }))) return;
    setBusy("status");
    try {
      await setKroegentochtStatus(kroegentochtId, "live");
      const s = await getKroegentochtStatus(kroegentochtId);
      onStatusChange(s);
      await loadSlots();
      showMessage("Kroegentocht is weer live.");
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "Kon status niet aanpassen.");
    } finally {
      setBusy(null);
    }
  }

  async function handleScheduleOffset(deltaSeconds: number) {
    setBusy("schedule");
    try {
      const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deltaSeconds }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Fout bij aanpassen.");
      const data = await res.json();
      onStatusChange({ ...status, scheduleOffsetSeconds: data.scheduleOffsetSeconds });
      const mins = Math.round(deltaSeconds / 60);
      showMessage(`Schema ${mins > 0 ? "+" : ""}${mins} minuten aangepast.`);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "Kon schema niet aanpassen.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showMessage("Link gekopieerd.");
    } catch {
      showMessage("Kopiëren mislukt — selecteer handmatig.");
    }
  }

  const programSlot = slots.find((s) => s.role === "program");
  const scoreboardSlot = slots.find((s) => s.role === "scoreboard");
  const supervisorSlots = slots.filter((s) => s.role === "supervisor");

  return (
    <div className="live-panel" style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0 }}>
              {status.status === "completed"
                ? "⚪ Kroegentocht afgerond"
                : isAfterLast(status)
                  ? "⚪ Kroegentocht afgelopen"
                  : isScheduledFuture(status)
                    ? "🟠 Kroegentocht is gepland"
                    : "🟢 Kroegentocht is live"}
            </h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
              {status.status === "completed"
                ? "De kroegentocht is afgerond. Scorebord en programma blijven 30 dagen beschikbaar via de bestaande links."
                : isAfterLast(status)
                  ? "Alle rondes zijn gespeeld. Klik op \"Kroegentocht afronden\" om de eindstand te bevestigen."
                  : isScheduledFuture(status)
                    ? `Start op ${new Date(status.startedAt!).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })} om ${new Date(status.startedAt!).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}. Links zijn al deelbaar met spelbegeleiders.`
                    : "Deel onderstaande links met de spelbegeleiders, ouders en zet het scorebord op een TV."}
            </p>
          </div>
          {status.status === "live" && !isScheduledFuture(status) && phaseInfo && (
            <LivePhaseIndicator info={phaseInfo} />
          )}
          {isScheduledFuture(status) && status.startedAt && (
            <ScheduledCountdown startedAt={status.startedAt} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          {status.status === "live" && (
            <button type="button" className="btn-primary" onClick={handleComplete} disabled={!!busy}>
              Kroegentocht afronden
            </button>
          )}
          {isScheduledFuture(status) && (
            <button type="button" className="btn-ghost" onClick={() => setSettingsOpen(true)}>
              Instellingen aanpassen
            </button>
          )}
          {status.status === "completed" && (
            <button type="button" className="btn-ghost" onClick={handleReopen} disabled={!!busy}>
              Heropenen
            </button>
          )}
        </div>
      </div>

      {status.status === "live" && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>Tijdschema aanpassen</h4>
            <HelpButton>
              <p style={{ margin: "0 0 8px" }}>
                <strong>Wat doet dit?</strong><br />
                Deze knoppen verschuiven het hele schema met een aantal minuten.
                De rondeduur en wisseltijd blijven hetzelfde — alles schuift simpelweg op in de tijd.
              </p>
              <p style={{ margin: "0 0 8px" }}>
                <strong>Wanneer gebruiken?</strong><br />
                Als de kroegentocht uitloopt door een lange wissel, blessure of andere vertraging.
                De time-cursor (speeltijd/wisseltijd) op alle schermen past zich automatisch aan.
              </p>
              <p style={{ margin: "0 0 8px" }}>
                <strong>Voorbeeld</strong><br />
                Ronde 3 had om 10:00 moeten starten maar begon pas om 10:07.
                Klik op "+5 min" en daarna "+2 min" (of direct "+10 min") totdat de klok weer klopt.
                Alle rondes erna schuiven mee.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Tip</strong><br />
                Verschuiving is cumulatief. Klik meerdere keren als je meer tijd nodig hebt.
                Met "−5 min" of "Reset" draai je het terug als je tijd hebt ingehaald.
              </p>
            </HelpButton>
          </div>
          <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
            Loopt de kroegentocht uit? Verschuif de klok zodat de time-cursor weer klopt.
            {status.scheduleOffsetSeconds !== 0 && (
              <strong> Huidige verschuiving: +{Math.round(status.scheduleOffsetSeconds / 60)} min.</strong>
            )}
          </p>
          <CustomOffsetInput busy={!!busy} currentOffset={status.scheduleOffsetSeconds} onApply={handleScheduleOffset} />
        </div>
      )}

      <ScoreCorrectionModal
        kroegentochtId={kroegentochtId}
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        onSaved={() => showMessage("Score aangepast.")}
      />

      {settingsOpen && (
        <KroegentochtSettingsModal
          kroegentochtId={kroegentochtId}
          status={status}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => {
            onStatusChange(updated);
            setSettingsOpen(false);
            showMessage("Instellingen opgeslagen.");
          }}
        />
      )}

      {loading ? (
        <p className="muted">Links laden...</p>
      ) : status.status !== "live" ? null : (
        <>
          {programSlot && (
            <SlotCard
              title="Publiek programma"
              description="Voor ouders, teambegeleiders en iedereen die het rooster wil volgen. Eén QR-code bij de ingang is genoeg."
              slot={programSlot}
              kroegentochtId={kroegentochtId}
              baseUrl={baseUrl}
              busy={busy === slotKey(programSlot)}
              onCopy={handleCopy}
              onRegenerate={() => handleRegenerate(programSlot)}
            />
          )}

          {scoreboardSlot && (
            <SlotCard
              title="Publiek scorebord (TV-modus)"
              description="Voor op een scherm in de kantine. Groot, leesbaar, geen interactie."
              slot={scoreboardSlot}
              kroegentochtId={kroegentochtId}
              baseUrl={baseUrl}
              busy={busy === slotKey(scoreboardSlot)}
              onCopy={handleCopy}
              onRegenerate={() => handleRegenerate(scoreboardSlot)}
            />
          )}

          {programSlot?.activeToken?.rawToken && (
            <MediaLinkCard
              programToken={programSlot.activeToken.rawToken}
              kroegentochtId={kroegentochtId}
              baseUrl={baseUrl}
              onCopy={handleCopy}
            />
          )}

          {supervisorSlots.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>Spelbegeleiders ({supervisorSlots.length})</h4>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => void downloadSupervisorQRPdf(supervisorSlots, baseUrl, kroegentochtId)}
                >
                  Download QR PDF
                </button>
              </div>
              <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.85rem" }}>
                Eén link per station. Print de QR-codes en leg ze bij het station — of mail de link rechtstreeks naar de begeleider.
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                {supervisorSlots.map((slot) => (
                  <SlotRow
                    key={slotKey(slot)}
                    slot={slot}
                    kroegentochtId={kroegentochtId}
                    baseUrl={baseUrl}
                    busy={busy === slotKey(slot)}
                    onCopy={handleCopy}
                    onRegenerate={() => handleRegenerate(slot)}
                    onRevoke={() => handleRevoke(slot)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

async function downloadSupervisorQRPdf(slots: LiveTokenSlot[], baseUrl: string, kroegentochtId: string) {
  const { jsPDF } = await import("jspdf");
  const QR = (await import("qrcode")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const qrSize = 60;
  const cardH = 80;
  const cols = 2;
  const colW = (pageW - margin * 2) / cols;
  let x = margin;
  let y = margin;
  let idx = 0;

  for (const slot of slots) {
    if (!slot.activeToken?.rawToken) continue;
    const url = buildKroegentochtUrl(slot.role, slot.activeToken.rawToken, baseUrl, kroegentochtId);
    const qrDataUrl = await QR.toDataURL(url, { width: 300, margin: 1 });

    if (y + cardH > pageH - margin) {
      doc.addPage();
      y = margin;
      x = margin;
      idx = 0;
    }

    doc.setDrawColor(200);
    doc.roundedRect(x, y, colW - 5, cardH - 5, 3, 3);
    doc.addImage(qrDataUrl, "PNG", x + 4, y + 4, qrSize - 8, qrSize - 8);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(slot.label, x + qrSize, y + 14, { maxWidth: colW - qrSize - 10 });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(url, x + qrSize, y + 24, { maxWidth: colW - qrSize - 10 });
    doc.setTextColor(0);
    doc.setFontSize(8);
    doc.text("Scan deze QR-code om scores in te voeren", x + 4, y + qrSize + 2);

    idx += 1;
    if (idx % cols === 0) {
      x = margin;
      y += cardH;
    } else {
      x += colW;
    }
  }

  doc.save("spelbegeleider-qr-codes.pdf");
}

interface StationStat {
  stationId: string;
  label: string;
  total: number;
  completed: number;
  cancelled: number;
  pending: number;
  lastActivity: string | null;
}

function MonitorSection({ kroegentochtId, onOpenCorrection }: { kroegentochtId: string; onOpenCorrection: () => void }) {
  const [stats, setStats] = useState<{ totalMatches: number; totalCompleted: number; totalCancelled: number; stations: StationStat[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = () => {
      fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/monitor`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled && d.stations) setStats(d); })
        .catch(() => {});
    };
    fetchStats();
    const id = setInterval(fetchStats, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, [kroegentochtId]);

  if (!stats) return null;

  const overallPct = stats.totalMatches > 0 ? Math.round((stats.totalCompleted / stats.totalMatches) * 100) : 0;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0 }}>Score-invoer voortgang</h4>
        <button type="button" className="btn-ghost btn-sm" onClick={onOpenCorrection}>Scores corrigeren</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}>
          <div style={{ width: `${overallPct}%`, height: "100%", borderRadius: 4, background: "var(--brand)", transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: "0.88rem", fontWeight: 600, flexShrink: 0 }}>
          {stats.totalCompleted}/{stats.totalMatches} ({overallPct}%)
        </span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {stats.stations.map((s) => {
          const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
          const lagging = pct < overallPct && s.pending > 0;
          return (
            <div
              key={s.stationId}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 5,
                border: "1px solid var(--line)",
                background: lagging ? "rgba(220, 38, 38, 0.04)" : "transparent",
              }}
            >
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                  {lagging && <span style={{ color: "var(--danger)", marginRight: 6 }}>●</span>}
                  {s.label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                  <div style={{ flex: 1, maxWidth: 120, height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: lagging ? "var(--danger)" : "var(--brand)", transition: "width 0.3s" }} />
                  </div>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>{s.completed}/{s.total}</span>
                </div>
              </div>
              <span className="muted" style={{ fontSize: "0.72rem", textAlign: "right" }}>
                {s.lastActivity ? fmtTimeAgo(s.lastActivity) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtTimeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "zojuist";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min geleden`;
  const hr = Math.floor(min / 60);
  return `${hr}u geleden`;
}

function LivePhaseIndicator({ info }: { info: LivePhaseInfo }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 3600), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const countdown = (iso: string | null) => {
    if (!iso) return null;
    const sec = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
    const hrs = Math.floor(sec / 3600);
    const min = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return hrs > 0 ? `${hrs}:${pad(min)}:${pad(s)}` : `${pad(min)}:${pad(s)}`;
  };

  let statusLabel: string;
  let roundLabel: string | null = null;
  let timeLabel: string | null = null;
  if (info.phase === "in_round" && info.currentRound) {
    statusLabel = "Speeltijd";
    roundLabel = `Ronde ${info.currentRound}/${info.totalRounds}`;
    timeLabel = countdown(info.roundEndsAt);
  } else if (info.phase === "transition") {
    statusLabel = "Wisseltijd";
    timeLabel = countdown(info.nextRoundStartsAt);
  } else if (info.phase === "before_first") {
    statusLabel = "Wachten op start";
    timeLabel = countdown(info.nextRoundStartsAt);
  } else if (info.phase === "after_last") {
    statusLabel = "Afgelopen";
  } else {
    statusLabel = "Live";
  }

  return (
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div className="muted" style={{ fontSize: "0.72rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {statusLabel}{roundLabel && ` · ${roundLabel}`}
      </div>
      {timeLabel ? (
        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "1.3rem", color: "var(--accent, #ff6b00)" }}>
          {timeLabel}
        </div>
      ) : info.startedAt ? (
        <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
          sinds {new Date(info.startedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
        </div>
      ) : (
        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>—</div>
      )}
    </div>
  );
}

function CustomOffsetInput({ busy, currentOffset, onApply }: { busy: boolean; currentOffset: number; onApply: (delta: number) => void }) {
  const [customMin, setCustomMin] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn-ghost btn-sm" onClick={() => onApply(5 * 60)} disabled={busy}>+5 min</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => onApply(10 * 60)} disabled={busy}>+10 min</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => onApply(15 * 60)} disabled={busy}>+15 min</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => onApply(-5 * 60)} disabled={busy || currentOffset < 300}>−5 min</button>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input
          type="number"
          value={customMin}
          onChange={(e) => setCustomMin(e.target.value)}
          placeholder="min"
          style={{ width: 56, padding: "4px 6px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--line)", textAlign: "center" }}
        />
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy || !customMin.trim() || Number(customMin) === 0}
          onClick={() => {
            const mins = Number(customMin);
            if (mins && Number.isFinite(mins)) {
              onApply(mins * 60);
              setCustomMin("");
            }
          }}
        >
          Toepassen
        </button>
      </div>
      {currentOffset > 0 && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => onApply(-currentOffset)} disabled={busy}>
          Reset
        </button>
      )}
    </div>
  );
}

function QRModal({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 280, margin: 2 }, (err) => {
      if (err) console.error("QR render:", err);
    });
  }, [url, mounted]);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="help-modal-card" style={{ width: "min(360px, 100%)", textAlign: "center" }}>
        <div className="help-modal-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Sluiten</button>
        </div>
        <canvas ref={canvasRef} width={280} height={280} style={{ borderRadius: 6 }} />
        <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.78rem", wordBreak: "break-all" }}>{url}</p>
      </div>
    </div>,
    document.body
  );
}

function HelpButton({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return (
    <>
      <button
        type="button"
        className="help-icon-button"
        onClick={() => setOpen(true)}
        aria-label="Meer informatie"
      >
        ?
      </button>
      {open && mounted && typeof document !== "undefined" && createPortal(
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="help-modal-card" style={{ width: "min(480px, 100%)" }}>
            <div className="help-modal-header" style={{ marginBottom: 12 }}>
              <h3>Tijdschema aanpassen</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Sluiten</button>
            </div>
            <div style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
              {children}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function SlotCard({
  title,
  description,
  slot,
  kroegentochtId,
  baseUrl,
  busy,
  onCopy,
  onRegenerate,
}: {
  title: string;
  description: string;
  slot: LiveTokenSlot;
  kroegentochtId: string;
  baseUrl: string;
  busy: boolean;
  onCopy: (url: string) => void;
  onRegenerate: () => void;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const url = slot.activeToken?.rawToken ? buildKroegentochtUrl(slot.role, slot.activeToken.rawToken, baseUrl, kroegentochtId) : "";
  const active = !!slot.activeToken;

  return (
    <div className="card" style={{ padding: 16, display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
      <div onClick={active ? () => setQrOpen(true) : undefined} style={{ cursor: active ? "pointer" : undefined }}>
        {active ? <QRImage value={url} size={128} /> : <QRPlaceholder size={128} />}
      </div>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>{description}</p>
        {active ? (
          <code style={{ fontSize: "0.78rem", background: "var(--bg-muted, rgba(0,0,0,0.04))", padding: "6px 8px", borderRadius: 4, wordBreak: "break-all" }}>
            {url}
          </code>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Link is ingetrokken. Klik op "Nieuwe link" om opnieuw te activeren.</p>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {active && <a href={url} target="_blank" rel="noopener noreferrer" className="button-link btn-sm btn-ghost" style={{ gap: 4 }}>↗ Openen</a>}
          {active && <button type="button" className="btn-sm btn-ghost" onClick={() => onCopy(url)}>Kopieer link</button>}
          {active && <button type="button" className="btn-sm btn-ghost" onClick={() => setQrOpen(true)}>QR-code</button>}
          <button type="button" className="btn-sm btn-ghost" onClick={onRegenerate} disabled={busy}>
            {busy ? "Bezig..." : active ? "Nieuwe link" : "Link activeren"}
          </button>
        </div>
        {qrOpen && url && <QRModal title={title} url={url} onClose={() => setQrOpen(false)} />}
      </div>
    </div>
  );
}

function MediaLinkCard({ programToken, kroegentochtId, baseUrl, onCopy }: { programToken: string; kroegentochtId: string; baseUrl: string; onCopy: (url: string) => void }) {
  const [qrOpen, setQrOpen] = useState(false);
  const url = buildMediaUrl(programToken, baseUrl, kroegentochtId);

  return (
    <div className="card" style={{ padding: 16, display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
      <div onClick={() => setQrOpen(true)} style={{ cursor: "pointer" }}>
        <QRImage value={url} size={128} />
      </div>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <h4 style={{ margin: 0 }}>Publieke foto&apos;s</h4>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Alle foto&apos;s van spelbegeleiders — met slideshow-modus voor op een scherm.</p>
        <code style={{ fontSize: "0.78rem", background: "var(--bg-muted, rgba(0,0,0,0.04))", padding: "6px 8px", borderRadius: 4, wordBreak: "break-all" }}>
          {url}
        </code>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="button-link btn-sm btn-ghost" style={{ gap: 4 }}>↗ Openen</a>
          <button type="button" className="btn-sm btn-ghost" onClick={() => onCopy(url)}>Kopieer link</button>
          <button type="button" className="btn-sm btn-ghost" onClick={() => setQrOpen(true)}>QR-code</button>
        </div>
        {qrOpen && <QRModal title="Publieke foto's" url={url} onClose={() => setQrOpen(false)} />}
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  kroegentochtId,
  baseUrl,
  busy,
  onCopy,
  onRegenerate,
  onRevoke,
}: {
  slot: LiveTokenSlot;
  kroegentochtId: string;
  baseUrl: string;
  busy: boolean;
  onCopy: (url: string) => void;
  onRegenerate: () => void;
  onRevoke: () => void;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const url = slot.activeToken?.rawToken ? buildKroegentochtUrl(slot.role, slot.activeToken.rawToken, baseUrl, kroegentochtId) : "";
  const active = !!slot.activeToken;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start", padding: 10, border: "1px solid var(--line)", borderRadius: 6 }}>
      <div onClick={active ? () => setQrOpen(true) : undefined} style={{ cursor: active ? "pointer" : undefined }}>
        {active ? <QRImage value={url} size={72} /> : <QRPlaceholder size={72} />}
      </div>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <strong>{slot.label}</strong>
        {active ? (
          <code style={{ fontSize: "0.72rem", color: "var(--muted)", wordBreak: "break-all" }}>
            {url}
          </code>
        ) : (
          <small className="muted">Link ingetrokken</small>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {active && <a href={url} target="_blank" rel="noopener noreferrer" className="button-link btn-sm btn-ghost" style={{ gap: 4 }}>↗ Openen</a>}
          {active && <button type="button" className="btn-sm btn-ghost" onClick={() => onCopy(url)}>Kopieer link</button>}
          {active && <button type="button" className="btn-sm btn-ghost" onClick={() => setQrOpen(true)}>QR-code</button>}
          <button type="button" className="btn-sm btn-ghost" onClick={onRegenerate} disabled={busy}>
            {active ? "Nieuwe link" : "Link activeren"}
          </button>
          {active && <button type="button" className="btn-sm danger-button" onClick={onRevoke} disabled={busy}>Intrekken</button>}
        </div>
        {qrOpen && url && <QRModal title={slot.label} url={url} onClose={() => setQrOpen(false)} />}
      </div>
    </div>
  );
}

function ScheduledCountdown({ startedAt }: { startedAt: string }) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const sec = Math.max(0, Math.floor((new Date(startedAt).getTime() - Date.now()) / 1000));
  const hrs = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const timeLabel = hrs > 0 ? `${hrs}:${pad(min)}:${pad(s)}` : `${pad(min)}:${pad(s)}`;

  return (
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div className="muted" style={{ fontSize: "0.72rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        Live over
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "1.3rem", color: "var(--accent, #ff6b00)" }}>
        {timeLabel}
      </div>
    </div>
  );
}

function KroegentochtSettingsModal({
  kroegentochtId,
  status,
  onClose,
  onSaved,
}: {
  kroegentochtId: string;
  status: KroegentochtStatusResponse;
  onClose: () => void;
  onSaved: (updated: KroegentochtStatusResponse) => void;
}) {
  const [config, setConfig] = useState<LiveConfig>(status.config ?? DEFAULT_LIVE_CONFIG);
  const [adminName, setAdminName] = useState(status.adminName ?? "");
  const [photosEnabled, setPhotosEnabled] = useState(status.photosEnabled ?? false);
  const [photoAutoApprove, setPhotoAutoApprove] = useState(status.photoAutoApprove ?? false);
  const [startedAt, setStartedAt] = useState(() => {
    if (!status.startedAt) return "";
    const d = new Date(status.startedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const settings: { startedAt?: string; liveConfig?: LiveConfig; adminName?: string; photosEnabled?: boolean; photoAutoApprove?: boolean } = { liveConfig: config };
      if (startedAt) settings.startedAt = new Date(startedAt).toISOString();
      settings.adminName = adminName.trim() || undefined;
      settings.photosEnabled = photosEnabled;
      settings.photoAutoApprove = photoAutoApprove;
      const updated = await updateKroegentochtSettings(kroegentochtId, settings);
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="help-modal-card" style={{ width: "min(520px, 100%)" }}>
        <div className="help-modal-header" style={{ marginBottom: 14 }}>
          <h3>Instellingen aanpassen</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} disabled={submitting}>Sluiten</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>Beheerdernaam (voor berichten)</span>
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value.slice(0, 100))}
              placeholder="Beheerder"
              style={{ maxWidth: 280 }}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>Starttijd</span>
            <input
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              style={{ maxWidth: 220 }}
            />
          </label>

          {config.scoring !== "challenge" && config.scoring !== "ranking_only" && (
            <>
              <h4 style={{ margin: "4px 0 0", fontSize: "0.95rem" }}>Puntensysteem</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label style={{ display: "grid", gap: 2 }}>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Winst</span>
                  <input type="number" min={0} value={config.pointsWin} onChange={(e) => setConfig({ ...config, pointsWin: Math.max(0, Number(e.target.value) || 0) })} />
                </label>
                <label style={{ display: "grid", gap: 2 }}>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Gelijk</span>
                  <input type="number" min={0} value={config.pointsDraw} onChange={(e) => setConfig({ ...config, pointsDraw: Math.max(0, Number(e.target.value) || 0) })} />
                </label>
                <label style={{ display: "grid", gap: 2 }}>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Verlies</span>
                  <input type="number" min={0} value={config.pointsLoss} onChange={(e) => setConfig({ ...config, pointsLoss: Math.max(0, Number(e.target.value) || 0) })} />
                </label>
              </div>
            </>
          )}

          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>Scoretype</span>
            <select value={config.scoring} onChange={(e) => setConfig({ ...config, scoring: e.target.value as LiveConfig["scoring"] })}>
              <option value="challenge">Challenge (score per groep, geen tegenstander)</option>
              <option value="win_loss">Winst/gelijk/verlies</option>
              <option value="goals_plus_win">Winst + doelpunten tellen mee</option>
              <option value="ranking_only">Alleen rangorde (estafette-modus)</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>Bij pauze/bye</span>
            <select value={config.byePolicy} onChange={(e) => setConfig({ ...config, byePolicy: e.target.value as LiveConfig["byePolicy"] })}>
              <option value="no_points_no_average">Geen punten, telt niet mee</option>
              <option value="average_of_played">Gemiddelde van eigen scores</option>
            </select>
          </label>

          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}
            onClick={() => setConfig({ ...config, showScoresOnProgram: !config.showScoresOnProgram })}
          >
            <input type="checkbox" checked={config.showScoresOnProgram} onChange={(e) => setConfig({ ...config, showScoresOnProgram: e.target.checked })} />
            <span>Scores tonen op publiek programma</span>
          </div>

          <h4 style={{ margin: "8px 0 0", fontSize: "0.95rem" }}>Foto&apos;s</h4>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}
            onClick={() => setPhotosEnabled(!photosEnabled)}
          >
            <input type="checkbox" checked={photosEnabled} onChange={(e) => setPhotosEnabled(e.target.checked)} />
            <span>Spelbegeleiders mogen foto&apos;s delen</span>
          </div>
          {photosEnabled && (
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer", marginLeft: 24 }}
              onClick={() => setPhotoAutoApprove(!photoAutoApprove)}
            >
              <input type="checkbox" checked={photoAutoApprove} onChange={(e) => setPhotoAutoApprove(e.target.checked)} />
              <span>Foto&apos;s automatisch goedkeuren (zonder moderatie)</span>
            </div>
          )}
        </div>

        {error && (
          <div className="notice notice-error" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>{error}</p>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={submitting}>Annuleren</button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={submitting}>
            {submitting ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
