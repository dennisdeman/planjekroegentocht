"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import type { MatchCancelReason, MatchResult, ActivityTypeV2 } from "@core";
import { findSpelByKey } from "@core";
import { useLiveState, submitScore, type LivePublicConfig } from "@lib/live/use-live-state";
import { enqueueScore, getQueueSize, startQueueProcessor } from "@lib/live/offline-queue";
import { compressImage } from "@lib/live/image-compress";
import { ChatPanel } from "@ui/chat/chat-panel";
import { ChatUnreadPoller, type LatestBroadcast } from "@ui/chat/chat-unread-poller";
import { ChatBroadcastBanner } from "@ui/chat/chat-broadcast-banner";

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const CANCEL_REASONS: Array<{ value: MatchCancelReason; label: string }> = [
  { value: "weather", label: "Weer" },
  { value: "no_show", label: "Groep niet aanwezig" },
  { value: "injury", label: "Blessure" },
  { value: "other", label: "Anders" },
];

export default function SupervisorPage() {
  const params = useParams<{ kroegentochtId: string; token: string }>();
  const token = params?.token ?? "";
  const { data, error, loading, refresh } = useLiveState("supervisor", token, 8000);
  const [nameRegistered, setNameRegistered] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setNameRegistered(!!localStorage.getItem(`sv-name-${token}`));
    }
  }, [token]);

  if (loading) {
    return <Center>Laden...</Center>;
  }
  if (error) {
    return (
      <Center>
        <div className="notice notice-error" style={{ maxWidth: 420 }}>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      </Center>
    );
  }
  if (!data) {
    return <Center>Geen data.</Center>;
  }

  return (
    <>
      <SupervisorView data={data} refresh={refresh} token={token} showNameModal={!nameRegistered} onNameRegistered={() => setNameRegistered(true)} />
    </>
  );
}

function SupervisorNameModal({ token, onDone }: { token: string; onDone: (name?: string) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await fetch(`/api/live/supervisor/${encodeURIComponent(token)}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      localStorage.setItem(`sv-name-${token}`, trimmed);
    } catch { /* ignore */ }
    onDone(trimmed);
  }

  function handleSkip() {
    localStorage.setItem(`sv-name-${token}`, "");
    onDone("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 9999, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 8px" }}>Welkom!</h3>
        <p style={{ margin: "0 0 16px", fontSize: "0.9rem", lineHeight: 1.5, color: "#555" }}>
          Vul je naam in zodat we weten wie de scores invoert.
        </p>
        <input
          type="text"
          placeholder="Je naam"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 100))}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          autoFocus
          style={{ width: "100%", marginBottom: 14, fontSize: "1rem", padding: "8px 12px" }}
          disabled={saving}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={handleSkip} disabled={saving} style={{ padding: "8px 16px", border: "1px dashed #ccc", background: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.88rem" }}>
            Overslaan
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !name.trim()} style={{ padding: "8px 16px", border: "none", background: "#ff6b00", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: "0.88rem", opacity: !name.trim() ? 0.5 : 1 }}>
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoUploadModal({ token, timeslotIndex, onClose, onUploaded }: { token: string; timeslotIndex: number | null; onClose: () => void; onUploaded: () => void }) {
  const [step, setStep] = useState<"pick" | "uploading" | "done" | "error">("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Alleen afbeeldingen zijn toegestaan.");
      setStep("error");
      return;
    }
    setStep("uploading");
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);

    try {
      // Stap 1: Compressie
      const { blob } = await compressImage(file);

      // Stap 2: Upload via server (server stuurt door naar R2)
      const formData = new FormData();
      formData.append("file", blob, file.name);
      if (timeslotIndex != null) formData.append("timeslotIndex", String(timeslotIndex));

      const res = await fetch(`/api/live/supervisor/${encodeURIComponent(token)}/photos`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Upload mislukt (status ${res.status})`);
      }

      onUploaded();
      setStep("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Upload mislukt.");
      setStep("error");
    }
  }

  function handleReset() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setErrorMsg("");
    setStep("pick");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 9999, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Foto delen</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", padding: "4px 8px" }}>
            &times;
          </button>
        </div>

        {step === "pick" && (
          <div style={{ display: "grid", gap: 10 }}>
            <input ref={captureInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button type="button" className="btn-primary" style={{ padding: "12px 16px", fontSize: "0.95rem" }} onClick={() => captureInputRef.current?.click()}>
              Foto maken
            </button>
            <button type="button" className="btn-ghost" style={{ padding: "12px 16px", fontSize: "0.95rem", border: "1px solid var(--line)" }} onClick={() => fileInputRef.current?.click()}>
              Kies uit album
            </button>
          </div>
        )}

        {step === "uploading" && (
          <div style={{ textAlign: "center" }}>
            {preview && <img src={preview} alt="Preview" style={{ width: "100%", borderRadius: 8, marginBottom: 12, maxHeight: 240, objectFit: "cover" }} />}
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>Bezig met uploaden...</p>
          </div>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center" }}>
            {preview && <img src={preview} alt="Geupload" style={{ width: "100%", borderRadius: 8, marginBottom: 12, maxHeight: 240, objectFit: "cover" }} />}
            <p style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "var(--success, #16a34a)", fontWeight: 600 }}>Foto gedeeld!</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button type="button" className="btn-primary btn-sm" onClick={handleReset}>
                + Nog een foto
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
                Sluiten
              </button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "var(--error, #dc2626)" }}>{errorMsg}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button type="button" className="btn-primary btn-sm" onClick={handleReset}>
                Opnieuw proberen
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
                Sluiten
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SupervisorView({ data, refresh, token, showNameModal, onNameRegistered }: { data: NonNullable<ReturnType<typeof useLiveState>["data"]>; refresh: () => Promise<void>; token: string; showNameModal?: boolean; onNameRegistered?: () => void }) {
  const svParams = useParams<{ kroegentochtId: string }>();
  const kroegentochtId = svParams?.kroegentochtId ?? "";
  const [previousOpen, setPreviousOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"station" | "schedule" | "info" | "more" | "chat">("station");
  const [queueCount, setQueueCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [latestBroadcast, setLatestBroadcast] = useState<LatestBroadcast | null>(null);
  const [chatInitialChannel, setChatInitialChannel] = useState<string | null>(null);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const [supervisorDisplayName, setSupervisorDisplayName] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSupervisorDisplayName(localStorage.getItem(`sv-name-${token}`) ?? "");
    }
  }, [token]);
  const { config, state } = data;

  // Offline queue processor
  useEffect(() => {
    setQueueCount(getQueueSize());
    const stop = startQueueProcessor(
      () => { setQueueCount(getQueueSize()); void refresh(); },
      (msg) => console.warn("Queue error:", msg),
    );
    return stop;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Foto-count ophalen
  useEffect(() => {
    fetch(`/api/live/supervisor/${encodeURIComponent(token)}/photos`)
      .then((r) => r.json())
      .then((d) => { if (d.photos) setPhotoCount(d.photos.length); })
      .catch(() => {});
  }, [token]);

  const stationId = data.scopeId ?? "";
  const station = config.stations.find((s) => s.id === stationId);
  const location = station ? config.locations.find((l) => l.id === station.locationId) : null;
  const activity = station ? config.activityTypes.find((a) => a.id === station.activityTypeId) : null;

  const activeTimeslots = useMemo(
    () => config.timeslots.filter((t) => t.kind === "active").sort((a, b) => a.index - b.index),
    [config.timeslots]
  );

  const groupById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of config.groups) m.set(g.id, g.name);
    return m;
  }, [config.groups]);

  // Alleen matches van dit station voor het "Mijn station"-paneel
  const myMatches = useMemo(
    () => (stationId ? state.matches.filter((m) => m.stationId === stationId) : state.matches),
    [state.matches, stationId]
  );

  const matchesBySlot = useMemo(() => {
    const m = new Map<number, MatchResult>();
    for (const match of myMatches) m.set(match.timeslotIndex, match);
    return m;
  }, [myMatches]);

  const currentIdx = state.cursor.currentTimeslotIndex;
  const nextIdxFromCursor = state.cursor.nextTimeslotIndex;
  const currentSlot = currentIdx != null ? activeTimeslots.find((t) => t.index === currentIdx) : null;

  // Bepaal de "anchor"-positie: index in activeTimeslots van de huidige óf de eerstvolgende ronde.
  let anchorPos: number;
  if (currentSlot) {
    anchorPos = activeTimeslots.findIndex((t) => t.index === currentSlot.index);
  } else if (nextIdxFromCursor != null) {
    anchorPos = activeTimeslots.findIndex((t) => t.index === nextIdxFromCursor);
  } else if (state.cursor.phase === "after_last") {
    anchorPos = activeTimeslots.length; // alles is voorbij
  } else {
    anchorPos = 0;
  }

  const previousSlots = activeTimeslots.slice(0, Math.max(0, anchorPos)).reverse(); // nieuwste eerst
  const nextSlot = currentSlot
    ? activeTimeslots[anchorPos + 1] ?? null
    : nextIdxFromCursor != null
      ? activeTimeslots[anchorPos] ?? null
      : null;

  const currentRoundNumber = currentSlot
    ? anchorPos + 1
    : state.cursor.phase === "after_last"
      ? activeTimeslots.length
      : nextIdxFromCursor != null
        ? anchorPos + 1
        : null;
  const totalRounds = activeTimeslots.length;

  function handleNameChanged(name: string) {
    setSupervisorDisplayName(name);
    onNameRegistered?.();
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 16 }}>
      {showNameModal && (
        <SupervisorNameModal
          token={token}
          onDone={(name) => handleNameChanged(name ?? "")}
        />
      )}
      {showPhotoUpload && (
        <PhotoUploadModal
          token={token}
          timeslotIndex={currentIdx}
          onClose={() => setShowPhotoUpload(false)}
          onUploaded={() => setPhotoCount((n) => n + 1)}
        />
      )}
      <header style={{ maxWidth: 560, margin: "0 auto 16px" }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{data.planName}</h2>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.88rem" }}>
                {supervisorDisplayName ? <><strong>{supervisorDisplayName}</strong> &mdash; </> : null}{activity?.name ?? "Spel"} @ {location?.name ?? "Veld"}
                {currentRoundNumber != null && (
                  <><br />Ronde <strong>{currentRoundNumber}/{totalRounds}</strong></>
                )}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", gap: 4 }}>
              <TimeIndicator cursor={state.cursor} />
              {data.photosEnabled && (
                <button
                  type="button"
                  onClick={() => setShowPhotoUpload(true)}
                  className="sv-camera-btn"
                  aria-label="Foto maken"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  {photoCount > 0 && <span className="sv-camera-badge">{photoCount}</span>}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {queueCount > 0 && (
        <div style={{ maxWidth: 560, margin: "0 auto 8px", padding: "8px 14px", background: "rgba(255, 107, 0, 0.12)", border: "1px solid rgba(255, 107, 0, 0.3)", borderRadius: 8, fontSize: "0.88rem", color: "var(--accent, #ff6b00)" }}>
          {queueCount} score{queueCount === 1 ? "" : "s"} wacht{queueCount === 1 ? "" : "en"} op verzending — wordt automatisch opnieuw geprobeerd.
        </div>
      )}

      <div className="sv-tabs" style={{ maxWidth: 560, margin: "0 auto 12px" }}>
        <button type="button" onClick={() => setActiveTab("station")} className={activeTab === "station" ? "sv-tab is-active" : "sv-tab"}>
          Station
        </button>
        <button type="button" onClick={() => setActiveTab("schedule")} className={activeTab === "schedule" ? "sv-tab is-active" : "sv-tab"}>
          Schema
        </button>
        <button type="button" onClick={() => setActiveTab("info")} className={activeTab === "info" ? "sv-tab is-active" : "sv-tab"}>
          Speluitleg
        </button>
        <button type="button" onClick={() => { setChatInitialChannel(null); setActiveTab("chat"); }} className={activeTab === "chat" ? "sv-tab is-active" : "sv-tab"} style={{ position: "relative" }}>
          Chat
          {chatUnread > 0 && activeTab !== "chat" && (
            <span className="chat-tab-badge">{chatUnread}</span>
          )}
        </button>
        <button type="button" onClick={() => setActiveTab("more")} className={activeTab === "more" ? "sv-tab is-active" : "sv-tab"}>
          Meer
        </button>
      </div>

      <ChatUnreadPoller mode="supervisor" identifier={token} onUnreadChange={setChatUnread} onBroadcast={setLatestBroadcast} />
      {activeTab !== "chat" && (
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 12px" }}>
          <ChatBroadcastBanner broadcast={latestBroadcast} onOpen={() => { setChatInitialChannel("group"); setActiveTab("chat"); }} />
        </div>
      )}

      {activeTab === "chat" && (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <ChatPanel mode="supervisor" identifier={token} currentSenderId={data.tokenId ?? token} initialChannel={chatInitialChannel} />
        </div>
      )}
      {activeTab === "more" && (
        <MoreView planId={kroegentochtId} publicTokens={data.publicTokens} token={token} onNameChanged={handleNameChanged} />
      )}
      {activeTab === "info" && (
        <SpelInfoView activity={activity ?? undefined} />
      )}
      {activeTab === "schedule" && (
        <ScheduleView
          data={data}
          activeTimeslots={activeTimeslots}
          groupNameById={groupById}
          myStationId={stationId}
          currentIdx={currentIdx}
          nextIdx={nextIdxFromCursor}
        />
      )}
      <main style={{ display: activeTab === "station" ? "grid" : "none", gap: 12, maxWidth: 560, margin: "0 auto" }}>
        {previousSlots.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <button
              type="button"
              onClick={() => setPreviousOpen((v) => !v)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "transparent", border: "1px solid var(--line)", borderRadius: 6, cursor: "pointer", fontSize: "0.88rem" }}
              aria-expanded={previousOpen}
            >
              <span><strong>Eerdere rondes</strong> <span className="muted" style={{ fontSize: "0.82rem" }}>({previousSlots.length})</span></span>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)", transform: previousOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
            </button>
            {previousOpen && (
              <div style={{ display: "grid", gap: 10 }}>
                {previousSlots.map((slot) => {
                  const match = matchesBySlot.get(slot.index);
                  if (!match) return null;
                  const roundNum = activeTimeslots.findIndex((t) => t.index === slot.index) + 1;
                  return (
                    <MatchPanel
                      key={slot.id}
                      tone="past"
                      label={`Ronde ${roundNum}/${totalRounds}`}
                      slot={slot}
                      match={match}
                      groupNameById={groupById}
                      token={token}
                      onSaved={refresh}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
        {currentSlot && matchesBySlot.get(currentSlot.index) && (
          <MatchPanel
            tone="current"
            label="Huidige ronde"
            slot={currentSlot}
            match={matchesBySlot.get(currentSlot.index)!}
            groupNameById={groupById}
            token={token}
            onSaved={refresh}
          />
        )}
        {!currentSlot && (
          <div className="notice" style={{ padding: 12 }}>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              {state.cursor.phase === "transition"
                ? "Wisseltijd — groepen wisselen van locatie. Volgende ronde staat hieronder klaar."
                : state.cursor.phase === "before_first"
                  ? "De kroegentocht is nog niet begonnen. Eerste ronde staat hieronder klaar."
                  : state.cursor.phase === "after_last"
                    ? "De kroegentocht is afgelopen. Alle matches staan hieronder."
                    : "Geen actieve ronde."}
            </p>
          </div>
        )}
        {nextSlot && matchesBySlot.get(nextSlot.index) && currentSlot?.index !== nextSlot.index && (
          <MatchPanel
            tone="upcoming"
            label="Volgende ronde"
            slot={nextSlot}
            match={matchesBySlot.get(nextSlot.index)!}
            groupNameById={groupById}
            token={token}
            onSaved={refresh}
            readonly
          />
        )}
      </main>
    </div>
  );
}

interface ScheduleViewProps {
  data: NonNullable<ReturnType<typeof useLiveState>["data"]>;
  activeTimeslots: LivePublicConfig["timeslots"];
  groupNameById: Map<string, string>;
  myStationId: string;
  currentIdx: number | null;
  nextIdx: number | null;
}

function ScheduleView({ data, activeTimeslots, groupNameById, myStationId, currentIdx, nextIdx }: ScheduleViewProps) {
  const { config, state } = data;

  const myStation = config.stations.find((s) => s.id === myStationId);
  const mySpelName = config.activityTypes.find((a) => a.id === myStation?.activityTypeId)?.name ?? "Spel";
  const myLocationName = config.locations.find((l) => l.id === myStation?.locationId)?.name ?? "Veld";

  const matchesBySlot = useMemo(() => {
    const m = new Map<number, typeof state.matches>();
    for (const match of state.matches) {
      if (match.stationId !== myStationId) continue;
      const arr = m.get(match.timeslotIndex) ?? [];
      arr.push(match);
      m.set(match.timeslotIndex, arr);
    }
    return m;
  }, [state.matches, myStationId]);

  return (
    <main style={{ display: "grid", gap: 14, maxWidth: 560, margin: "0 auto", padding: "0 2px" }}>
      <p className="muted" style={{ margin: "0 0 2px", fontSize: "0.82rem" }}>
        Alle wedstrijden op dit station — {mySpelName} @ {myLocationName}.
      </p>
      {activeTimeslots.map((slot, i) => {
        const matches = matchesBySlot.get(slot.index) ?? [];
        const isNow = slot.index === currentIdx;
        const isNext = !isNow && slot.index === nextIdx;
        const highlighted = isNow || isNext;
        return (
          <section
            key={slot.id}
            className="card"
            style={{
              padding: 12,
              borderWidth: highlighted ? 2 : 1,
              borderStyle: "solid",
              borderColor: isNow ? "var(--brand)" : isNext ? "var(--accent)" : "var(--line)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: "0.92rem" }}>
                Ronde {i + 1}/{activeTimeslots.length}
                {isNow && <span style={{ marginLeft: 8, color: "var(--brand)", fontSize: "0.78rem" }}>● LIVE</span>}
                {isNext && <span style={{ marginLeft: 8, color: "var(--accent)", fontSize: "0.78rem" }}>▸ VOLGENDE</span>}
              </strong>
              <small className="muted">{fmtTime(slot.start)} – {fmtTime(slot.end)}</small>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {matches.length === 0 && <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Geen wedstrijden in deze ronde.</p>}
              {matches.map((m) => {
                const gA = groupNameById.get(m.groupAId) ?? m.groupAId;
                const gB = m.groupBId ? (groupNameById.get(m.groupBId) ?? m.groupBId) : null;
                const completed = m.status === "completed";
                const cancelled = m.status === "cancelled";
                const scoreLabel = completed && m.scoreA != null && m.scoreB != null
                  ? `${m.scoreA} – ${m.scoreB}`
                  : cancelled
                    ? "afgelast"
                    : gB
                      ? "–"
                      : "rust";
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 5,
                      border: "1px solid var(--line)",
                    }}
                  >
                    <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                      {gA}{gB && <> <span className="muted">vs</span> {gB}</>}
                    </div>
                    <strong
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: completed ? "var(--text)" : cancelled ? "var(--danger)" : "var(--muted)",
                        fontSize: completed ? "1.05rem" : "0.9rem",
                      }}
                    >
                      {scoreLabel}
                    </strong>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}


function MoreView({ planId, publicTokens, token, onNameChanged }: { planId: string; publicTokens?: { program: string | null; scoreboard: string | null }; token: string; onNameChanged?: (name: string) => void }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const programUrl = publicTokens?.program && origin ? `${origin}/live/${encodeURIComponent(planId)}/program/${encodeURIComponent(publicTokens.program)}` : null;
  const scoreboardUrl = publicTokens?.scoreboard && origin ? `${origin}/live/${encodeURIComponent(planId)}/scoreboard/${encodeURIComponent(publicTokens.scoreboard)}` : null;

  return (
    <main style={{ display: "grid", gap: 12, maxWidth: 560, margin: "0 auto", padding: "0 2px" }}>
      <EditSupervisorName token={token} onNameChanged={onNameChanged} />

      <p className="muted" style={{ margin: "0 0 2px", fontSize: "0.82rem" }}>
        Publieke links — deel met ouders of zet op een scherm.
      </p>

      <MoreLinkCard
        title="Publiek programma"
        description="Volledig rooster met live scores — doorzoekbaar per groep."
        url={programUrl}
      />
      <MoreLinkCard
        title="Publiek scorebord"
        description="TV-vriendelijk klassement voor op een groot scherm."
        url={scoreboardUrl}
      />
    </main>
  );
}

function EditSupervisorName({ token, onNameChanged }: { token: string; onNameChanged?: (name: string) => void }) {
  const [name, setName] = useState("");
  const [previousName, setPreviousName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`sv-name-${token}`) ?? "";
      setName(stored);
      setPreviousName(stored);
    }
  }, [token]);

  async function handleSave() {
    const trimmed = name.trim();
    setSaving(true);
    setSaved(false);
    try {
      if (trimmed) {
        await fetch(`/api/live/supervisor/${encodeURIComponent(token)}/name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, previousName }),
        });
      }
      localStorage.setItem(`sv-name-${token}`, trimmed);
      onNameChanged?.(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <section className="card" style={{ padding: 14 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Je naam</h3>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
        Zichtbaar bij scores die je invoert en in berichten.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 100))}
          placeholder="Je naam"
          style={{ flex: 1, maxWidth: 220, fontSize: "0.9rem", padding: "6px 10px" }}
          disabled={saving}
        />
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "..." : saved ? "Opgeslagen" : "Opslaan"}
        </button>
      </div>
    </section>
  );
}

function MoreLinkCard({ title, description, url }: { title: string; description: string; url: string | null }) {
  const [qrOpen, setQrOpen] = useState(false);

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  }

  return (
    <section className="card" style={{ padding: 14 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>{title}</h3>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>{description}</p>
      {url ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="button-link btn-primary btn-sm">
            Openen
          </a>
          <button type="button" className="btn-ghost btn-sm" onClick={handleCopy}>Kopieer link</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setQrOpen(true)}>QR-code</button>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Link niet beschikbaar. Vraag de organisator om deze te genereren.</p>
      )}
      {qrOpen && url && <QRModal title={title} url={url} onClose={() => setQrOpen(false)} />}
    </section>
  );
}

function QRModal({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 280, margin: 2 }, (err) => {
      if (err) console.error("QR render:", err);
    });
  }, [url, mounted]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="help-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
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

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
      <div style={{ textAlign: "center" }}>{children}</div>
    </div>
  );
}

function TimeIndicator({ cursor }: { cursor: { phase: string; roundEndsAt: string | null; nextRoundStartsAt: string | null; delaySeconds: number } }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 3600), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const countdown = (iso: string) => {
    const totalSec = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
    const hrs = Math.floor(totalSec / 3600);
    const min = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return hrs > 0 ? `${hrs}:${pad(min)}:${pad(s)}` : `${pad(min)}:${pad(s)}`;
  };

  let main: string;
  let sub: string | null = null;

  if (cursor.phase === "in_round" && cursor.roundEndsAt) {
    main = countdown(cursor.roundEndsAt);
    sub = "tot einde ronde";
  } else if (cursor.phase === "transition" && cursor.nextRoundStartsAt) {
    main = countdown(cursor.nextRoundStartsAt);
    sub = "wisseltijd";
  } else if (cursor.phase === "before_first" && cursor.nextRoundStartsAt) {
    main = countdown(cursor.nextRoundStartsAt);
    sub = "tot start";
  } else if (cursor.phase === "after_last") {
    main = "Kroegentocht afgelopen";
  } else {
    main = "Niet live";
  }

  return (
    <div style={{ textAlign: "right" }}>
      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{main}</strong>
      {sub && <div className="muted" style={{ fontSize: "0.72rem" }}>{sub}</div>}
      {cursor.delaySeconds > 0 && (
        <div className="muted" style={{ fontSize: "0.72rem" }}>+{Math.round(cursor.delaySeconds / 60)} min vertraging</div>
      )}
    </div>
  );
}

interface MatchPanelProps {
  tone: "past" | "current" | "upcoming";
  label: string;
  slot: LivePublicConfig["timeslots"][number];
  match: MatchResult;
  groupNameById: Map<string, string>;
  token: string;
  onSaved: () => Promise<void>;
  readonly?: boolean;
}

function MatchPanel({ tone, label, slot, match, groupNameById, token, onSaved, readonly }: MatchPanelProps) {
  const [scoreA, setScoreA] = useState<number>(match.scoreA ?? 0);
  const [scoreB, setScoreB] = useState<number>(match.scoreB ?? 0);
  const [cancelMenuOpen, setCancelMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = useState<null | "no_show" | "other">(null);

  // Sync bij refresh (useEffect i.p.v. useMemo — setState hoort niet in useMemo)
  const lastSyncVersionRef = useRef(match.version);
  useEffect(() => {
    if (match.version !== lastSyncVersionRef.current) {
      setScoreA(match.scoreA ?? 0);
      setScoreB(match.scoreB ?? 0);
      initialScoreRef.current = { a: match.scoreA ?? 0, b: match.scoreB ?? 0 };
      lastSyncVersionRef.current = match.version;
    }
  }, [match.scoreA, match.scoreB, match.version]);

  // Auto-save tussenstand als in_progress (debounced)
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialScoreRef = useRef({ a: match.scoreA ?? 0, b: match.scoreB ?? 0 });
  useEffect(() => {
    if (readonly || match.status === "completed" || match.status === "cancelled" || !match.groupBId) return;
    if (scoreA === initialScoreRef.current.a && scoreB === initialScoreRef.current.b) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      initialScoreRef.current = { a: scoreA, b: scoreB };
      const svName = typeof window !== "undefined" ? localStorage.getItem(`sv-name-${token}`) || undefined : undefined;
      submitScore(token, {
        timeslotIndex: match.timeslotIndex,
        stationId: match.stationId,
        groupAId: match.groupAId,
        scoreA,
        scoreB,
        status: "in_progress",
        version: match.version,
        enteredByName: svName,
      }).catch(() => {});
    }, 1500);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [scoreA, scoreB]);

  const nameA = groupNameById.get(match.groupAId) ?? match.groupAId;
  const nameB = match.groupBId ? (groupNameById.get(match.groupBId) ?? match.groupBId) : null;
  const isBye = !match.groupBId;
  const isCancelled = match.status === "cancelled";
  const isCompleted = match.status === "completed";

  async function save(
    nextStatus: "completed" | "in_progress" | "cancelled" | "scheduled",
    opts?: { cancelReason?: MatchCancelReason; cancelNote?: string; overrideScoreA?: number; overrideScoreB?: number }
  ) {
    setSubmitting(true);
    setLocalError(null);
    const effScoreA = opts?.overrideScoreA ?? (isBye || nextStatus === "cancelled" ? null : scoreA);
    const effScoreB = opts?.overrideScoreB ?? (isBye || nextStatus === "cancelled" ? null : scoreB);
    const svName = typeof window !== "undefined" ? localStorage.getItem(`sv-name-${token}`) || undefined : undefined;
    const scoreInput = {
      timeslotIndex: match.timeslotIndex,
      stationId: match.stationId,
      groupAId: match.groupAId,
      scoreA: effScoreA,
      scoreB: effScoreB,
      status: nextStatus,
      cancelReason: nextStatus === "cancelled" ? opts?.cancelReason ?? "other" : null,
      cancelNote: nextStatus === "cancelled" ? opts?.cancelNote ?? null : null,
      version: match.version,
      enteredByName: svName,
    };
    const result = await submitScore(token, scoreInput);
    if (!result.ok) {
      if (result.conflict) {
        const cA = result.conflict.scoreA ?? 0;
        const cB = result.conflict.scoreB ?? 0;
        setLocalError(`Score is aangepast door de beheerder. Huidige stand: ${cA} - ${cB}.`);
        setScoreA(cA);
        setScoreB(cB);
      } else {
        // Netwerk- of serverfout → queue voor later
        enqueueScore(token, scoreInput);
        setLocalError("Geen verbinding — score wordt automatisch verzonden zodra het netwerk terug is.");
      }
    }
    await onSaved();
    setSubmitting(false);
  }

  const borderColor = tone === "current" ? "var(--brand)" : tone === "past" ? "var(--line)" : "var(--line)";
  const bg = tone === "current" ? "var(--card-bg)" : "var(--card-bg)";
  const opacity = tone === "upcoming" ? 0.7 : 1;
  const stackZ = tone === "current" ? 20 : tone === "past" ? 10 : 1;

  return (
    <section className="card" style={{ padding: 14, borderColor, borderWidth: tone === "current" ? 2 : 1, borderStyle: "solid", background: bg, opacity, position: "relative", zIndex: stackZ }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: "0.88rem" }}>{label}</strong>
        <small className="muted">{fmtTime(slot.start)} – {fmtTime(slot.end)}</small>
      </div>

      {isBye ? (
        <div style={{ textAlign: "center", padding: 20 }}>
          <h3 style={{ margin: "0 0 4px" }}>{nameA}</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>Rust / pauze-activiteit</p>
        </div>
      ) : isCancelled ? (
        <div style={{ textAlign: "center", padding: 20 }}>
          <h3 style={{ margin: "0 0 4px" }}>{nameA} vs {nameB}</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Afgelast ({cancelReasonLabel(match.cancelReason)})
          </p>
          {match.cancelNote && (
            <p style={{ margin: "6px 0 0", fontSize: "0.85rem", fontStyle: "italic" }}>"{match.cancelNote}"</p>
          )}
          {!readonly && (
            <button type="button" className="btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => save("scheduled")}>
              Weer inplannen
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center" }}>
            <ScoreColumn
              name={nameA!}
              score={scoreA}
              onChange={setScoreA}
              readonly={readonly || isCompleted}
              hideScore={readonly && match.status === "scheduled"}
            />
            <div style={{ fontSize: "1.2rem", color: "var(--muted)" }}>–</div>
            <ScoreColumn
              name={nameB!}
              score={scoreB}
              onChange={setScoreB}
              readonly={readonly || isCompleted}
              hideScore={readonly && match.status === "scheduled"}
            />
          </div>

          {!readonly && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {!isCompleted && (
                  <button type="button" className="btn-primary btn-sm" onClick={() => save("completed")} disabled={submitting}>
                    {submitting ? "Bezig..." : "Klaar"}
                  </button>
                )}
                {isCompleted && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => save("in_progress")} disabled={submitting}>
                    Bewerk
                  </button>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setCancelMenuOpen((v) => !v)} disabled={submitting}>
                  Afzeggen…
                </button>
                {cancelMenuOpen && (
                  <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: 4, zIndex: 10, minWidth: 180, boxShadow: "0 6px 16px rgba(16, 33, 52, 0.12)" }}>
                    {CANCEL_REASONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: 0, cursor: "pointer" }}
                        onClick={() => {
                          setCancelMenuOpen(false);
                          if (r.value === "no_show" || r.value === "other") {
                            setCancelDialog(r.value);
                          } else {
                            void save("cancelled", { cancelReason: r.value });
                          }
                        }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {localError && (
            <div className="notice notice-error" style={{ marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: "0.85rem" }}>{localError}</p>
            </div>
          )}
        </>
      )}

      {cancelDialog === "no_show" && !isBye && nameB && (
        <NoShowDialog
          nameA={nameA}
          nameB={nameB}
          onCancel={() => setCancelDialog(null)}
          onConfirm={async (absent) => {
            setCancelDialog(null);
            if (absent === "both") {
              await save("cancelled", { cancelReason: "no_show" });
              return;
            }
            // Eén groep afwezig → andere wint met 1-0
            await save("completed", {
              overrideScoreA: absent === "a" ? 0 : 1,
              overrideScoreB: absent === "b" ? 0 : 1,
            });
          }}
        />
      )}

      {cancelDialog === "other" && (
        <OtherReasonDialog
          onCancel={() => setCancelDialog(null)}
          onConfirm={async (note) => {
            setCancelDialog(null);
            await save("cancelled", { cancelReason: "other", cancelNote: note });
          }}
        />
      )}
    </section>
  );
}

function cancelReasonLabel(reason: MatchCancelReason | null): string {
  switch (reason) {
    case "weather": return "weer";
    case "no_show": return "groep niet aanwezig";
    case "injury": return "blessure";
    case "other": return "anders";
    default: return "onbekend";
  }
}

function NoShowDialog({ nameA, nameB, onCancel, onConfirm }: { nameA: string; nameB: string; onCancel: () => void; onConfirm: (absent: "a" | "b" | "both") => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="help-modal-card" style={{ width: "min(360px, 100%)" }}>
        <div className="help-modal-header" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Welke groep was niet aanwezig?</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Sluiten</button>
        </div>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.86rem" }}>
          Bij één afwezige groep krijgt de tegenpartij 1–0.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" className="btn-secondary" onClick={() => onConfirm("a")}>{nameA} was niet aanwezig</button>
          <button type="button" className="btn-secondary" onClick={() => onConfirm("b")}>{nameB} was niet aanwezig</button>
          <button type="button" className="btn-ghost" onClick={() => onConfirm("both")}>Beide niet aanwezig</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function OtherReasonDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (note: string) => void }) {
  const [mounted, setMounted] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="help-modal-card" style={{ width: "min(400px, 100%)" }}>
        <div className="help-modal-header" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Reden</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Sluiten</button>
        </div>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: "0.86rem" }}>Waarom is deze wedstrijd afgelast?</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bijv. scheidsrechter ontbrak"
          rows={3}
          maxLength={400}
          style={{ width: "100%", resize: "vertical", padding: 8, border: "1px solid var(--line)", borderRadius: 6, fontFamily: "inherit", fontSize: "0.9rem" }}
          autoFocus
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
          <button type="button" className="btn-ghost" onClick={onCancel}>Annuleren</button>
          <button type="button" className="btn-primary" onClick={() => onConfirm(note.trim())} disabled={note.trim().length === 0}>
            Bevestig
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ScoreColumn({ name, score, onChange, readonly, hideScore }: { name: string; score: number; onChange: (n: number) => void; readonly?: boolean; hideScore?: boolean }) {
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div className="sv-score-name">{name}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {!readonly && (
          <button type="button" className="btn-ghost sv-score-btn" onClick={() => onChange(Math.max(0, score - 1))}>
            −
          </button>
        )}
        <div className="sv-score-value" style={{ color: hideScore ? "var(--muted)" : undefined }}>
          {hideScore ? "–" : score}
        </div>
        {!readonly && (
          <button type="button" className="btn-ghost sv-score-btn" onClick={() => onChange(score + 1)}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

function SpelInfoView({ activity }: { activity: { name: string; baseId?: string | null } | undefined }) {
  const spel = activity?.baseId ? findSpelByKey(activity.baseId) : null;
  const explanation = spel?.explanation;
  const materials = spel?.materials ?? [];

  if (!explanation && materials.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <p className="muted" style={{ margin: 0 }}>
            Geen speluitleg beschikbaar voor {activity?.name ?? "deze spel"}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 10 }}>
      {explanation && (
        <div className="card" style={{ padding: 16 }}>
          {explanation.summary && (
            <p style={{ margin: "0 0 10px", fontSize: "0.95rem", fontStyle: "italic", color: "var(--muted)" }}>
              {explanation.summary}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, fontSize: "0.82rem", color: "var(--muted)" }}>
            {explanation.playersPerTeam && <span>Spelers: <strong>{explanation.playersPerTeam}</strong></span>}
            {explanation.duration && <span>Duur: <strong>{explanation.duration}</strong></span>}
          </div>
          {explanation.rules && (
            <>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.92rem" }}>Spelregels</h4>
              <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: "0.88rem", lineHeight: 1.6 }}>
                {explanation.rules.split("\n").filter(Boolean).map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </>
          )}
          {explanation.variants && (
            <>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.92rem" }}>Varianten</h4>
              <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.6 }}>{explanation.variants}</p>
            </>
          )}
        </div>
      )}

      {explanation?.fieldSetup && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ margin: "0 0 6px", fontSize: "0.92rem" }}>Veldopzet</h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.88rem", lineHeight: 1.6 }}>
            {explanation.fieldSetup.split("\n").filter(Boolean).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {materials.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: "0.92rem" }}>Materialen</h4>
          <div style={{ display: "grid", gap: 4 }}>
            {materials.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", padding: "4px 0", borderBottom: "1px solid var(--line)", opacity: item.optional ? 0.6 : 1 }}>
                <span>{item.name}{item.optional && <span className="muted" style={{ fontSize: "0.75rem", marginLeft: 4 }}>optioneel</span>}</span>
                <span className="muted">{item.quantity} {item.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
