"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { MatchResult } from "@core";
import { useLiveState, type LivePublicConfig } from "@lib/live/use-live-state";
import { alertDialog } from "@ui/ui/confirm-dialog";

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function ProgramPage() {
  const params = useParams<{ kroegentochtId: string; token: string }>();
  const token = params?.token ?? "";
  const { data, error, loading } = useLiveState("program", token, 8000);

  if (loading) return <Center>Laden...</Center>;
  if (error) return <Center><div className="notice notice-error"><p style={{ margin: 0 }}>{error}</p></div></Center>;
  if (!data) return <Center>Geen data.</Center>;

  return <ProgramView data={data} />;
}

function ProgramView({ data }: { data: NonNullable<ReturnType<typeof useLiveState>["data"]> }) {
  const searchParams = useSearchParams();
  const initialGroupQuery = searchParams?.get("group") ?? "";
  const [groupQuery, setGroupQuery] = useState(initialGroupQuery);

  const { config, state } = data;

  const allTimeslots = useMemo(
    () => [...config.timeslots].sort((a, b) => a.index - b.index),
    [config.timeslots]
  );

  const activeTimeslots = useMemo(
    () => allTimeslots.filter((t) => t.kind === "active"),
    [allTimeslots]
  );

  // Program items van de server
  interface ProgramItemData { id: string; title: string; description: string | null; startTime: string; endTime: string | null; icon: string }
  const programItems: ProgramItemData[] = (data as unknown as Record<string, unknown>).programItems as ProgramItemData[] ?? [];

  // Build display list: timeslots + transitions + program items, chronologisch
  type DisplayItem =
    | { type: "round"; slot: typeof allTimeslots[number]; roundNum: number; sortMs: number }
    | { type: "break"; slot: typeof allTimeslots[number]; sortMs: number }
    | { type: "transition"; minutes: number; sortMs: number }
    | { type: "program-item"; item: ProgramItemData; sortMs: number };

  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    let roundNum = 0;
    for (let i = 0; i < allTimeslots.length; i++) {
      const slot = allTimeslots[i];
      if (i > 0) {
        const prevEnd = new Date(allTimeslots[i - 1].end).getTime();
        const curStart = new Date(slot.start).getTime();
        const gapMin = Math.round((curStart - prevEnd) / 60_000);
        if (gapMin > 0) {
          items.push({ type: "transition", minutes: gapMin, sortMs: prevEnd + 1 });
        }
      }
      if (slot.kind === "active") {
        roundNum++;
        items.push({ type: "round", slot, roundNum, sortMs: new Date(slot.start).getTime() });
      } else {
        items.push({ type: "break", slot, sortMs: new Date(slot.start).getTime() });
      }
    }

    // Voeg programma-items toe — normaliseer naar fake-UTC datum voor correcte sortering
    for (const pi of programItems) {
      const d = new Date(pi.startTime);
      const fakeSortMs = Date.UTC(2026, 0, 1, d.getHours(), d.getMinutes(), 0, 0);
      items.push({ type: "program-item", item: pi, sortMs: fakeSortMs });
    }

    // Sorteer alles chronologisch
    items.sort((a, b) => a.sortMs - b.sortMs);
    return items;
  }, [allTimeslots, programItems]);

  const groupById = useMemo(() => new Map(config.groups.map((g) => [g.id, g.name])), [config.groups]);

  const matchesBySlot = useMemo(() => {
    const m = new Map<number, MatchResult[]>();
    for (const match of state.matches) {
      const arr = m.get(match.timeslotIndex) ?? [];
      arr.push(match);
      m.set(match.timeslotIndex, arr);
    }
    return m;
  }, [state.matches]);

  // Match op groepsnaam — hele woorden
  const matchedGroupIds = useMemo(() => {
    const q = groupQuery.trim();
    if (!q) return null;
    const tokens = q.split(/\s+/).filter(Boolean);
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = new Set<string>();
    for (const g of config.groups) {
      const ok = tokens.every((tk) => new RegExp(`\\b${escape(tk)}\\b`, "i").test(g.name));
      if (ok) matches.add(g.id);
    }
    return matches;
  }, [groupQuery, config.groups]);

  function slotHasFilteredGroup(slotIndex: number): boolean {
    if (!matchedGroupIds) return true;
    const ms = matchesBySlot.get(slotIndex) ?? [];
    return ms.some((m) => matchedGroupIds.has(m.groupAId) || (m.groupBId && matchedGroupIds.has(m.groupBId)));
  }

  const currentIdx = state.cursor.currentTimeslotIndex;
  const nextIdx = state.cursor.nextTimeslotIndex;
  const showScores = state.config.showScoresOnProgram !== false;

  // Auto-scroll naar huidige of volgende ronde bij eerste load
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current) return;
    const target = currentIdx ?? nextIdx;
    if (target == null) return;
    const el = document.getElementById(`slot-${target}`);
    if (el) {
      // Korte delay zodat layout gestabiliseerd is
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      scrolledRef.current = true;
    }
  }, [currentIdx, nextIdx]);

  const filteredMatches = (ms: MatchResult[]) => {
    if (!matchedGroupIds) return ms;
    return ms.filter((m) => matchedGroupIds.has(m.groupAId) || (m.groupBId && matchedGroupIds.has(m.groupBId)));
  };

  async function handleShare() {
    if (!matchedGroupIds) return;
    const q = groupQuery.trim();
    const url = new URL(window.location.href);
    url.searchParams.set("group", q);
    const shareUrl = url.toString();

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${data.planName} — ${q}`, url: shareUrl });
        return;
      } catch {
        // fallback naar clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      void alertDialog({ message: "Link gekopieerd naar klembord.", variant: "success" });
    } catch {
      void alertDialog({ message: "Kopiëren mislukt. Kopieer de URL handmatig.", variant: "error" });
    }
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "#eef1f5",
          padding: "12px 16px",
          borderBottom: "1px solid var(--line)",
          boxShadow: "0 2px 8px rgba(16, 33, 52, 0.06)",
        }}
      >
        <header style={{ maxWidth: 720, margin: "0 auto 10px" }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{data.planName}</h2>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.82rem" }}>
                  Live programma — volg het rooster{showScores ? ", zie de actuele scores" : ""}.
                </p>
              </div>
              <ProgramTimeIndicator cursor={state.cursor} />
            </div>
          </div>
        </header>

        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <input
              type="text"
              value={groupQuery}
              onChange={(e) => setGroupQuery(e.target.value)}
              placeholder="Zoek op groepsnaam, bijv. Groep 6B"
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, fontSize: "0.95rem", background: "#fff" }}
            />
            {groupQuery && (
              <button
                type="button"
                onClick={() => setGroupQuery("")}
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: "4px 8px", fontSize: "0.78rem", background: "transparent", border: 0, color: "var(--muted)" }}
              >
                Wissen
              </button>
            )}
          </div>
          {matchedGroupIds && (
            <button type="button" className="btn-primary btn-sm" onClick={handleShare}>
              Deel deze groep
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "16px" }}>

      {matchedGroupIds && matchedGroupIds.size === 0 && (
        <div style={{ maxWidth: 720, margin: "0 auto 14px" }}>
          <div className="notice" style={{ padding: 12 }}>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>Geen groepen gevonden voor "{groupQuery}". Probeer een andere zoekterm.</p>
          </div>
        </div>
      )}

      <main style={{ display: "grid", gap: 12, maxWidth: 720, margin: "0 auto" }}>
        {displayItems.map((item, idx) => {
          if (item.type === "transition") {
            // Don't show transition when filtering and adjacent rounds are hidden
            return (
              <div key={`trans-${idx}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span className="muted" style={{ fontSize: "0.76rem", whiteSpace: "nowrap" }}>
                  Wisseltijd · {item.minutes} min
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>
            );
          }

          if (item.type === "break") {
            const slot = item.slot;
            const isNow = slot.index === currentIdx;
            return (
              <div
                key={slot.id}
                id={`slot-${slot.index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: isNow ? "rgba(74, 144, 226, 0.08)" : "var(--bg-offset, #f5f7fa)",
                  border: isNow ? "2px solid var(--brand)" : "1px dashed var(--line)",
                  scrollMarginTop: 12,
                }}
              >
                <span style={{ fontSize: "1.1rem" }}>☕</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "0.88rem" }}>
                    Pauze
                    {isNow && <span style={{ marginLeft: 8, color: "var(--brand)", fontSize: "0.78rem" }}>● NU</span>}
                  </strong>
                </div>
                <small className="muted">{fmtTime(slot.start)} – {fmtTime(slot.end)}</small>
              </div>
            );
          }

          if (item.type === "program-item") {
            const pi = item.item;
            const iconMap: Record<string, string> = { event: "📋", coffee: "☕", food: "🍖", trophy: "🏆", music: "🎵", speech: "🎤", flag: "🚩" };
            return (
              <div
                key={pi.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "var(--bg-offset, #f5f7fa)",
                  border: "1px solid var(--line)",
                }}
              >
                <span style={{ fontSize: "1.1rem" }}>{iconMap[pi.icon] ?? "📋"}</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "0.88rem" }}>{pi.title}</strong>
                  {pi.description && <div className="muted" style={{ fontSize: "0.78rem" }}>{pi.description}</div>}
                </div>
                <small className="muted">
                  {fmtTime(pi.startTime)}{pi.endTime ? ` – ${fmtTime(pi.endTime)}` : ""}
                </small>
              </div>
            );
          }

          // item.type === "round"
          const slot = item.slot;
          const matches = filteredMatches(matchesBySlot.get(slot.index) ?? []);
          const isNow = slot.index === currentIdx;
          const isNext = !isNow && slot.index === nextIdx;
          if (matchedGroupIds && !slotHasFilteredGroup(slot.index)) return null;

          return (
            <section
              key={slot.id}
              id={`slot-${slot.index}`}
              className="card"
              style={{
                padding: 12,
                borderWidth: isNow || isNext ? 2 : 1,
                borderStyle: "solid",
                borderColor: isNow ? "var(--brand)" : isNext ? "var(--accent)" : "var(--line)",
                scrollMarginTop: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: "0.92rem" }}>
                  Ronde {item.roundNum}/{activeTimeslots.length}
                  {isNow && <span style={{ marginLeft: 8, color: "var(--brand)", fontSize: "0.78rem" }}>● LIVE</span>}
                  {isNext && <span style={{ marginLeft: 8, color: "var(--accent)", fontSize: "0.78rem" }}>▸ VOLGENDE</span>}
                </strong>
                <small className="muted">{fmtTime(slot.start)} – {fmtTime(slot.end)}</small>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                {matches.length === 0 && (
                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Geen wedstrijden.</p>
                )}
                {matches.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    config={config}
                    groupById={groupById}
                    highlightedGroupIds={matchedGroupIds}
                    showScore={showScores}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </main>
      </div>
    </div>
  );
}

function MatchRow({
  match,
  config,
  groupById,
  highlightedGroupIds,
  showScore,
}: {
  match: MatchResult;
  config: LivePublicConfig;
  groupById: Map<string, string>;
  highlightedGroupIds: Set<string> | null;
  showScore: boolean;
}) {
  const station = config.stations.find((s) => s.id === match.stationId);
  const location = station ? config.locations.find((l) => l.id === station.locationId) : null;
  const activity = station ? config.activityTypes.find((a) => a.id === station.activityTypeId) : null;

  const gA = groupById.get(match.groupAId) ?? match.groupAId;
  const gB = match.groupBId ? (groupById.get(match.groupBId) ?? match.groupBId) : null;
  const completed = match.status === "completed";
  const cancelled = match.status === "cancelled";
  const scoreLabel = !showScore && completed
    ? "gespeeld"
    : completed && match.scoreA != null && match.scoreB != null
      ? `${match.scoreA} – ${match.scoreB}`
      : cancelled
        ? "afgelast"
        : gB
          ? "–"
          : "rust";

  const highlightA = highlightedGroupIds?.has(match.groupAId) ?? false;
  const highlightB = match.groupBId ? (highlightedGroupIds?.has(match.groupBId) ?? false) : false;
  const isHighlighted = highlightA || highlightB;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 5,
        background: isHighlighted ? "rgba(74, 144, 226, 0.08)" : "transparent",
        border: "1px solid var(--line)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>
          <span style={{ fontWeight: highlightA ? 700 : 500 }}>{gA}</span>
          {gB && <> <span className="muted">vs</span> <span style={{ fontWeight: highlightB ? 700 : 500 }}>{gB}</span></>}
        </div>
        <div className="muted" style={{ fontSize: "0.76rem" }}>
          {activity?.name ?? "Spel"} @ {location?.name ?? "Veld"}
        </div>
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
}

function ProgramTimeIndicator({ cursor }: { cursor: { phase: string; roundEndsAt: string | null; nextRoundStartsAt: string | null; delaySeconds: number } }) {
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
    main = "Afgelopen";
  } else {
    main = "Niet live";
  }

  return (
    <div style={{ textAlign: "right" }}>
      <strong style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.05rem" }}>{main}</strong>
      {sub && <div className="muted" style={{ fontSize: "0.72rem" }}>{sub}</div>}
      {cursor.delaySeconds > 0 && (
        <div className="muted" style={{ fontSize: "0.72rem" }}>+{Math.round(cursor.delaySeconds / 60)} min vertraging</div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
      <div style={{ textAlign: "center" }}>{children}</div>
    </div>
  );
}
