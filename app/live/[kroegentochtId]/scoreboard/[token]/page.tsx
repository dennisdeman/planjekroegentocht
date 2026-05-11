"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { MatchResult } from "@core";
import { useLiveState, type LivePublicConfig } from "@lib/live/use-live-state";

export default function ScoreboardPage() {
  const params = useParams<{ kroegentochtId: string; token: string }>();
  const token = params?.token ?? "";
  const { data, error, loading } = useLiveState("scoreboard", token, 6000);

  if (loading) return <Center>Laden...</Center>;
  if (error) return <Center><div className="notice notice-error"><p style={{ margin: 0 }}>{error}</p></div></Center>;
  if (!data) return <Center>Geen data.</Center>;

  return <ScoreboardView data={data} />;
}

function ScoreboardView({ data }: { data: NonNullable<ReturnType<typeof useLiveState>["data"]> }) {
  const { config, state } = data;
  const currentIdx = state.cursor.currentTimeslotIndex;

  const groupById = useMemo(() => new Map(config.groups.map((g) => [g.id, g.name])), [config.groups]);

  const currentMatches = useMemo(() => {
    if (currentIdx == null) return [];
    return state.matches.filter((m) => m.timeslotIndex === currentIdx && m.groupBId).sort((a, b) => a.stationId.localeCompare(b.stationId));
  }, [state.matches, currentIdx]);

  return (
    <div
      style={{
        height: "100vh",
        background: "#0a1424",
        color: "#fff",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        overflow: "hidden",
      }}
    >
      <ScoreboardHeader planName={data.planName} cursor={state.cursor} />
      <LeaderboardList leaderboard={state.leaderboard} />
      <CurrentMatchTicker matches={currentMatches} config={config} groupById={groupById} />
    </div>
  );
}

function ScoreboardHeader({ planName, cursor }: { planName: string; cursor: NonNullable<ReturnType<typeof useLiveState>["data"]>["state"]["cursor"] }) {
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

  const now = new Date();
  const clockLabel = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  let countdownLabel: string = "";
  let countdownSub: string = "";
  if (cursor.phase === "in_round" && cursor.roundEndsAt) {
    countdownLabel = countdown(cursor.roundEndsAt);
    countdownSub = "TOT EINDE RONDE";
  } else if (cursor.phase === "transition" && cursor.nextRoundStartsAt) {
    countdownLabel = countdown(cursor.nextRoundStartsAt);
    countdownSub = "WISSELTIJD";
  } else if (cursor.phase === "before_first" && cursor.nextRoundStartsAt) {
    countdownLabel = countdown(cursor.nextRoundStartsAt);
    countdownSub = "TOT START";
  } else if (cursor.phase === "after_last") {
    countdownLabel = "AFGELOPEN";
  }

  const statusFontSize = "clamp(1.4rem, min(2.8vw, 4.5vh), 3.2rem)";
  const titleFontSize = "clamp(1.2rem, min(2.6vw, 4vh), 3rem)";
  const subLabelStyle = { fontSize: "clamp(0.7rem, min(0.9vw, 1.4vh), 1rem)", opacity: 0.55, letterSpacing: "0.12em", textTransform: "uppercase" as const };

  return (
    <header className="scoreboard-header">
      {/* Left: wall clock */}
      <div style={{ textAlign: "left", flexShrink: 0 }}>
        <div style={subLabelStyle}>Tijd</div>
        <div style={{ fontSize: statusFontSize, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: "#fff" }}>
          {clockLabel}
        </div>
      </div>

      {/* Middle: title */}
      <div style={{ minWidth: 0, flex: "1 1 auto", textAlign: "center" }}>
        <div style={subLabelStyle}>Scorebord</div>
        <h1 style={{ margin: "2px 0 0", fontSize: titleFontSize, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{planName}</h1>
      </div>

      {/* Right: round countdown */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {countdownSub && <div style={subLabelStyle}>{countdownSub}</div>}
        <div
          style={{
            fontSize: statusFontSize,
            fontWeight: 800,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: "#fff",
          }}
        >
          {countdownLabel || "—"}
        </div>
        {cursor.delaySeconds > 0 && (
          <div style={{ ...subLabelStyle, color: "#ff6b00", marginTop: 4 }}>
            +{Math.round(cursor.delaySeconds / 60)} min vertraging
          </div>
        )}
      </div>
    </header>
  );
}

function LeaderboardList({ leaderboard }: { leaderboard: NonNullable<ReturnType<typeof useLiveState>["data"]>["state"]["leaderboard"] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    const tick = () => {
      const el = scrollRef.current;
      const copy = copyRef.current;
      if (!el || !copy) return;
      const copyHeight = copy.offsetHeight;
      const copyTop = copy.offsetTop;
      if (copyHeight <= 0) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return; // past in viewport, geen loop nodig
      // Seamless loop: zodra scrollTop de start van tabel B bereikt, spring
      // een hele kopie terug zodat we visueel op dezelfde rij in tabel A staan.
      const loopPoint = copyTop + copyHeight;
      if (el.scrollTop >= loopPoint) {
        el.scrollTop = el.scrollTop - copyHeight;
      } else {
        el.scrollTop = el.scrollTop + 1;
      }
    };

    const id = setInterval(tick, 40);
    return () => clearInterval(id);
  }, [leaderboard.length]);

  const rankColors: Record<number, { bg: string; fg: string }> = {
    1: { bg: "#f4c430", fg: "#3a2500" }, // goud
    2: { bg: "#c5cbd3", fg: "#1e2733" }, // zilver
    3: { bg: "#cd7f32", fg: "#2a1400" }, // brons
  };
  const defaultRank = { bg: "#1e3a5f", fg: "#fff" }; // donkerblauw

  const renderRows = (keyPrefix: string) => leaderboard.map((entry) => (
    <tr
      key={`${keyPrefix}-${entry.groupId}`}
      style={{ background: "rgba(255, 255, 255, 0.04)", borderRadius: 8 }}
    >
      <td
        style={{
          textAlign: "center",
          borderTopLeftRadius: 8,
          borderBottomLeftRadius: 8,
        }}
      >
        <RankBadge rank={entry.rank} played={entry.played} rankColors={rankColors} defaultRank={defaultRank} />
      </td>
      <td style={{ fontWeight: 600 }}>{entry.groupName}</td>
      <td className="col-played" style={{ textAlign: "center", opacity: 0.7 }}>{entry.played}</td>
      <td className="col-goals" style={{ textAlign: "center", opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
        {entry.goalsFor}–{entry.goalsAgainst}
      </td>
      <td
        style={{
          textAlign: "center",
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: "#ff6b00",
          borderTopRightRadius: 8,
          borderBottomRightRadius: 8,
        }}
      >
        {entry.points}
      </td>
    </tr>
  ));

  const tableStyle = { width: "100%", borderCollapse: "separate" as const, borderSpacing: "0 clamp(3px, 0.6vh, 8px)", fontSize: "clamp(0.95rem, min(1.4vw, 2.2vh), 1.8rem)", tableLayout: "fixed" as const };
  const colgroup = (
    <colgroup>
      <col style={{ width: "clamp(60px, 7vw, 110px)" }} />
      <col />
      <col className="col-played" style={{ width: "clamp(90px, 10vw, 160px)" }} />
      <col className="col-goals" style={{ width: "clamp(120px, 12vw, 200px)" }} />
      <col style={{ width: "clamp(90px, 10vw, 160px)" }} />
    </colgroup>
  );

  return (
    <div ref={scrollRef} className="scoreboard-body">
      {leaderboard.length === 0 && (
        <div style={{ textAlign: "center", padding: "64px 16px", opacity: 0.5, fontSize: "1.4rem" }}>
          Nog geen punten gescoord.
        </div>
      )}
      <table
        className="scoreboard-table"
        style={{
          ...tableStyle,
          position: "sticky",
          top: 0,
          zIndex: 1,
          background: "#0a1424",
        }}
      >
        {colgroup}
        <thead style={{ opacity: 0.6, fontSize: "clamp(0.75rem, min(1vw, 1.6vh), 1.1rem)" }}>
          <tr>
            <th style={{ textAlign: "center", fontWeight: 500, letterSpacing: "0.08em", background: "#0a1424" }}>RANG</th>
            <th style={{ textAlign: "left", fontWeight: 500, letterSpacing: "0.08em", background: "#0a1424" }}>NAAM</th>
            <th className="col-played" style={{ textAlign: "center", fontWeight: 500, letterSpacing: "0.08em", background: "#0a1424" }}>GESPEELD</th>
            <th className="col-goals" style={{ textAlign: "center", fontWeight: 500, letterSpacing: "0.08em", background: "#0a1424" }}>UITSLAG</th>
            <th style={{ textAlign: "center", fontWeight: 500, letterSpacing: "0.08em", background: "#0a1424" }}>PUNTEN</th>
          </tr>
        </thead>
      </table>
      <table ref={copyRef} className="scoreboard-table" style={tableStyle}>
        {colgroup}
        <tbody>{renderRows("a")}</tbody>
      </table>
      <table className="scoreboard-table" aria-hidden="true" style={tableStyle}>
        {colgroup}
        <tbody>{renderRows("b")}</tbody>
      </table>
      <table className="scoreboard-table" aria-hidden="true" style={tableStyle}>
        {colgroup}
        <tbody>{renderRows("c")}</tbody>
      </table>
    </div>
  );
}

function CurrentMatchTicker({
  matches,
  config,
  groupById,
}: {
  matches: MatchResult[];
  config: LivePublicConfig;
  groupById: Map<string, string>;
}) {
  if (matches.length === 0) {
    return (
      <footer className="scoreboard-ticker">
        <div style={{ display: "flex", gap: "clamp(8px, 2vw, 40px)", alignItems: "center", fontSize: "clamp(0.9rem, min(2.2vw, 3.5vh), 2.4rem)", flexWrap: "wrap", justifyContent: "center" }}>
          <strong style={{ color: "#ff6b00", letterSpacing: "0.1em" }}>● WACHTEN</strong>
          <span style={{ opacity: 0.7 }}>Geen actieve wedstrijden op dit moment.</span>
        </div>
      </footer>
    );
  }

  const renderMatch = (m: MatchResult, keyPrefix: string) => {
    const gA = groupById.get(m.groupAId) ?? m.groupAId;
    const gB = m.groupBId ? (groupById.get(m.groupBId) ?? m.groupBId) : null;
    const station = config.stations.find((s) => s.id === m.stationId);
    const location = station ? config.locations.find((l) => l.id === station.locationId) : null;
    const activity = station ? config.activityTypes.find((a) => a.id === station.activityTypeId) : null;
    const scoreText = m.status === "completed" && m.scoreA != null && m.scoreB != null
      ? `${m.scoreA}–${m.scoreB}`
      : m.status === "cancelled"
        ? "afgelast"
        : "";
    return (
      <span key={`${keyPrefix}-${m.id}`} style={{ opacity: 0.9 }}>
        <strong>{gA}</strong>
        {gB && <> <span style={{ opacity: 0.5 }}> tegen </span><strong>{gB}</strong></>}
        {scoreText && <> <span style={{ color: "#ff6b00", fontWeight: 700, marginLeft: 6 }}>{scoreText}</span></>}
        <span style={{ opacity: 0.5 }}>: {activity?.name} op {location?.name}</span>
      </span>
    );
  };

  return (
    <footer className="scoreboard-ticker">
      <div style={{ display: "flex", gap: "clamp(16px, 2.5vw, 40px)", alignItems: "center", fontSize: "clamp(1.4rem, min(2.2vw, 3.5vh), 2.4rem)" }}>
        <strong style={{ color: "#ff6b00", letterSpacing: "0.1em", flexShrink: 0 }}>● NU LIVE</strong>
        <div className="scoreboard-ticker-viewport">
          <div className="scoreboard-ticker-track">
            {matches.map((m) => renderMatch(m, "a"))}
            {matches.map((m) => renderMatch(m, "b"))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function RankBadge({
  rank,
  played,
  rankColors,
  defaultRank,
}: {
  rank: number;
  played: number;
  rankColors: Record<number, { bg: string; fg: string }>;
  defaultRank: { bg: string; fg: string };
}) {
  const colors = played === 0 ? defaultRank : (rankColors[rank] ?? defaultRank);
  const label = played === 0 ? "–" : rank;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "clamp(30px, min(3.5vw, 5vh), 50px)",
        height: "clamp(30px, min(3.5vw, 5vh), 50px)",
        borderRadius: "50%",
        background: colors.bg,
        color: colors.fg,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }}
    >
      {label}
    </span>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16, background: "#0a1424", color: "#fff" }}>
      <div style={{ textAlign: "center" }}>{children}</div>
    </div>
  );
}
