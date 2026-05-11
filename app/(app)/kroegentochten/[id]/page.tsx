"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { LiveCursor } from "@core";
import { NotificationBar } from "@ui/ui/notification-bar";
import { LivePanel } from "@ui/planner/live-panel";
import { MatchScheduleSection } from "@ui/planner/match-schedule-section";
import { ScoreProgressSection } from "@ui/planner/score-progress-section";
import { ChatPanel } from "@ui/chat/chat-panel";
import { ChatUnreadPoller } from "@ui/chat/chat-unread-poller";
import { PhotoGallery } from "@ui/planner/photo-gallery";
import { ProgramItemsSection } from "@ui/planner/program-items-section";
import { KroegentochtExportModal } from "@ui/planner/kroegentocht-export-modal";
import { getKroegentochtStatus, type KroegentochtStatusResponse } from "@lib/kroegentochten/api";

type Tab = "beheer" | "dagprogramma" | "voortgang" | "spelschema" | "berichten" | "media";

export default function KroegentochtDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const kroegentochtId = params?.id ?? "";
  const [status, setStatus] = useState<KroegentochtStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type?: "success" | "error" | "info" } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("beheer");
  const [chatUnread, setChatUnread] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportData, setExportData] = useState<{ config: unknown; plan: unknown } | null>(null);

  useEffect(() => {
    if (!kroegentochtId) return;
    setLoading(true);
    getKroegentochtStatus(kroegentochtId)
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "Laden mislukt."))
      .finally(() => setLoading(false));
  }, [kroegentochtId]);

  if (loading) {
    return (
      <div className="planner-page" style={{ display: "grid", placeItems: "center", minHeight: 200 }}>
        <p className="muted">Laden...</p>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="planner-page">
        <section className="card empty-state">
          <h3>Kroegentocht niet gevonden</h3>
          <p>{error ?? "Kon kroegentocht niet laden."}</p>
          <Link href="/kroegentochten" className="button-link btn-primary">Terug naar overzicht</Link>
        </section>
      </div>
    );
  }

  const isLiveOrCompleted = status.status === "live" || status.status === "completed";

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "beheer", label: "Beheer", show: true },
    { key: "dagprogramma", label: "Dagprogramma", show: isLiveOrCompleted },
    { key: "voortgang", label: "Score-invoer voortgang", show: isLiveOrCompleted },
    { key: "spelschema", label: "Spelschema", show: isLiveOrCompleted },
    { key: "berichten", label: "Berichten", show: isLiveOrCompleted },
    { key: "media", label: "Media", show: isLiveOrCompleted },
  ];

  return (
    <div className="planner-page">
      {message && (
        <NotificationBar message={message.text} type={message.type} onClose={() => setMessage(null)} />
      )}

      <section className="card print-hide" style={{ marginBottom: 0 }}>
        <header className="planner-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>Kroegentocht beheren</h2>
            <p className="muted" style={{ margin: 0 }}>
              Status: {status.status === "completed"
                ? "Afgerond"
                : status.status === "live" && status.startedAt && new Date(status.startedAt).getTime() > Date.now()
                  ? "Gepland"
                  : status.status === "live" && status.effectiveEndAt && new Date(status.effectiveEndAt).getTime() < Date.now()
                    ? "Afgelopen"
                    : status.status === "live"
                      ? "Live"
                      : "Draft"}
            </p>
          </div>
          <div className="inline-actions" style={{ display: "grid", gap: 6, justifyItems: "end" }}>
            {isLiveOrCompleted && <KroegentochtTimer kroegentochtId={kroegentochtId} />}
            <div style={{ display: "flex", gap: 6 }}>
              {isLiveOrCompleted && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={async () => {
                    if (!exportData) {
                      const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/matches`);
                      const d = await res.json();
                      if (d.config && d.planSnapshot) setExportData({ config: d.config, plan: d.planSnapshot });
                    }
                    setExportOpen(true);
                  }}
                >
                  Exporteren
                </button>
              )}
              <Link href="/kroegentochten" className="button-link btn-ghost">
                Terug naar overzicht
              </Link>
            </div>
          </div>
        </header>

        <div className="kroegentocht-tabs print-hide">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.key}
              type="button"
              className={`kroegentocht-tab${activeTab === t.key ? " kroegentocht-tab-active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              {t.key === "berichten" && chatUnread > 0 && activeTab !== "berichten" && (
                <span className="chat-tab-badge">{chatUnread}</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {isLiveOrCompleted && (
        <ChatUnreadPoller mode="admin" identifier={kroegentochtId} onUnreadChange={setChatUnread} />
      )}

      {activeTab === "beheer" && (
        <div className="print-hide">
          <LivePanel
            kroegentochtId={kroegentochtId}
            status={status}
            onStatusChange={setStatus}
            showMessage={(text) => setMessage({ text, type: "info" })}
          />
        </div>
      )}

      {activeTab === "dagprogramma" && isLiveOrCompleted && (
        <ProgramItemsSection kroegentochtId={kroegentochtId} />
      )}

      {activeTab === "voortgang" && isLiveOrCompleted && (
        <ScoreProgressSection kroegentochtId={kroegentochtId} />
      )}

      {activeTab === "spelschema" && isLiveOrCompleted && (
        <MatchScheduleSection kroegentochtId={kroegentochtId} />
      )}

      {activeTab === "berichten" && isLiveOrCompleted && session?.user?.id && (
        <ChatPanel mode="admin" identifier={kroegentochtId} currentSenderId={session.user.id} onUnreadChange={setChatUnread} />
      )}

      {activeTab === "media" && isLiveOrCompleted && (
        <PhotoGallery kroegentochtId={kroegentochtId} />
      )}

      {exportOpen && exportData && (
        <KroegentochtExportModal
          config={exportData.config as import("@core").ConfigV2}
          plan={exportData.plan as import("@core").PlanV2}
          kroegentochtId={kroegentochtId}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

function KroegentochtTimer({ kroegentochtId }: { kroegentochtId: string }) {
  const [cursor, setCursor] = useState<LiveCursor | null>(null);
  const [totalRounds, setTotalRounds] = useState(0);
  const [, setTick] = useState(0);

  const [activeIndices, setActiveIndices] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchCursor = () => {
      fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/matches`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (d.cursor) setCursor(d.cursor);
          if (d.config?.timeslots) {
            const active = (d.config.timeslots as { kind: string; index: number }[])
              .filter((t) => t.kind === "active")
              .sort((a, b) => a.index - b.index);
            setTotalRounds(active.length);
            setActiveIndices(active.map((t) => t.index));
          }
        })
        .catch(() => {});
    };
    fetchCursor();
    const id = setInterval(fetchCursor, 8_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [kroegentochtId]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 3600), 1000);
    return () => clearInterval(id);
  }, []);

  if (!cursor || cursor.phase === "not_live") return null;

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

  if (cursor.phase === "in_round" && cursor.currentTimeslotIndex !== null) {
    statusLabel = "Speeltijd";
    const roundNum = activeIndices.indexOf(cursor.currentTimeslotIndex) + 1;
    roundLabel = `Ronde ${roundNum || cursor.currentTimeslotIndex}/${totalRounds}`;
    timeLabel = countdown(cursor.roundEndsAt);
  } else if (cursor.phase === "transition") {
    statusLabel = "Wisseltijd";
    timeLabel = countdown(cursor.nextRoundStartsAt);
  } else if (cursor.phase === "before_first") {
    statusLabel = "Wachten op start";
    timeLabel = countdown(cursor.nextRoundStartsAt);
  } else if (cursor.phase === "after_last") {
    statusLabel = "Afgelopen";
  } else {
    return null;
  }

  return (
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div className="muted" style={{ fontSize: "0.72rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {statusLabel}{roundLabel && ` · ${roundLabel}`}
      </div>
      {timeLabel && (
        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "1.3rem", color: "var(--accent, #ff6b00)" }}>
          {timeLabel}
        </div>
      )}
    </div>
  );
}
