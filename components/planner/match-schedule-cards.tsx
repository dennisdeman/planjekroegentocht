"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchResult, Id, GroupV2, StationV2, LocationV2, ActivityTypeV2, TimeslotV2, LiveCursor } from "@core";

interface MatchScheduleCardsProps {
  matches: MatchResult[];
  cursor: LiveCursor | null;
  activeTimeslots: TimeslotV2[];
  filteredStations: StationV2[];
  groupById: Map<Id, GroupV2>;
  stationById: Map<Id, StationV2>;
  locationById: Map<Id, LocationV2>;
  activityTypeById: Map<Id, ActivityTypeV2>;
  filterGroupId: string;
  autoScroll: boolean;
  onMatchClick: (match: MatchResult) => void;
  onByeClick: (match: MatchResult, el: HTMLElement) => void;
  onColumnHeaderClick: (timeslotIndex: number, el: HTMLElement) => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return "--:--"; }
}

export function MatchScheduleCards({
  matches,
  cursor,
  activeTimeslots,
  filteredStations,
  groupById,
  locationById,
  activityTypeById,
  filterGroupId,
  onMatchClick,
  onByeClick,
}: MatchScheduleCardsProps) {
  const initialIndex = useMemo(() => {
    if (cursor?.currentTimeslotIndex !== null && cursor?.currentTimeslotIndex !== undefined) {
      const idx = activeTimeslots.findIndex((ts) => ts.index === cursor.currentTimeslotIndex);
      if (idx >= 0) return idx;
    }
    if (cursor?.nextTimeslotIndex !== null && cursor?.nextTimeslotIndex !== undefined) {
      const idx = activeTimeslots.findIndex((ts) => ts.index === cursor.nextTimeslotIndex);
      if (idx >= 0) return idx;
    }
    return 0;
  }, []);

  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  const currentTimeslot = activeTimeslots[currentIdx];
  if (!currentTimeslot) return null;

  const isActiveRound = cursor?.currentTimeslotIndex === currentTimeslot.index;
  const isPast = cursor?.phase === "after_last"
    || (cursor?.currentTimeslotIndex !== null && cursor?.currentTimeslotIndex !== undefined && currentTimeslot.index < cursor.currentTimeslotIndex)
    || (cursor?.phase === "transition" && cursor?.nextTimeslotIndex !== null && cursor?.nextTimeslotIndex !== undefined && currentTimeslot.index < cursor.nextTimeslotIndex);

  const roundMatches = useMemo(() => {
    const stationIds = new Set(filteredStations.map((s) => s.id));
    return matches.filter((m) => m.timeslotIndex === currentTimeslot.index && stationIds.has(m.stationId));
  }, [matches, currentTimeslot.index, filteredStations]);

  const progress = useMemo(() => {
    let total = 0, completed = 0, cancelled = 0;
    for (const m of roundMatches) {
      if (m.groupBId === null) continue;
      total++;
      if (m.status === "completed") completed++;
      if (m.status === "cancelled") cancelled++;
    }
    return { total, completed, cancelled };
  }, [roundMatches]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && currentIdx < activeTimeslots.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else if (dx > 0 && currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  }

  return (
    <div
      className="match-round-card"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="match-round-header">
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx(currentIdx - 1)}
        >
          ◀
        </button>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontWeight: 600 }}>
            Ronde {currentTimeslot.index + 1} · {formatTime(currentTimeslot.start)} – {formatTime(currentTimeslot.end)}
          </div>
          <div className="muted" style={{ fontSize: "0.78rem" }}>
            {isActiveRound ? "★ Nu bezig" : isPast ? "Afgelopen" : "Nog niet gestart"}
            {progress.total > 0 ? ` · ${progress.completed}/${progress.total} scores` : ""}
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={currentIdx === activeTimeslots.length - 1}
          onClick={() => setCurrentIdx(currentIdx + 1)}
        >
          ▶
        </button>
      </div>

      <div className="match-round-matches">
        {roundMatches.map((match) => {
          const station = filteredStations.find((s) => s.id === match.stationId);
          const activity = station ? activityTypeById.get(station.activityTypeId) : undefined;
          const location = station ? locationById.get(station.locationId) : undefined;
          const isBye = match.groupBId === null;

          const nameA = groupById.get(match.groupAId)?.name ?? "?";
          const nameB = match.groupBId ? groupById.get(match.groupBId)?.name ?? "?" : null;

          const isHighlighted = filterGroupId && (match.groupAId === filterGroupId || match.groupBId === filterGroupId);
          const isDimmed = filterGroupId && !isHighlighted;

          let statusClass = "";
          if (match.status === "cancelled") statusClass = "match-card-cancelled";
          else if (match.status === "completed" && match.scoreA !== null) statusClass = "match-card-completed";
          else if (isPast && match.status !== "completed" && !isBye) statusClass = "match-card-missing";

          return (
            <div
              key={match.id}
              className={`match-card-item ${statusClass}${isHighlighted ? " match-cell-highlight" : ""}${isDimmed ? " match-cell-dimmed" : ""}`}
              onClick={(e) => {
                if (isBye) onByeClick(match, e.currentTarget);
                else onMatchClick(match);
              }}
            >
              <div className="match-card-station">
                {activity?.name ?? station?.name ?? "?"} @ {location?.name ?? "?"}
              </div>
              {isBye ? (
                <div className="muted" style={{ fontSize: "0.82rem" }}>bye · {nameA}</div>
              ) : (
                <div className="match-card-score-row">
                  <span>{nameA}</span>
                  <span className="match-card-vs">vs</span>
                  <span>{nameB}</span>
                  {match.status === "cancelled" ? (
                    <span className="match-cell-cancelled-text" style={{ marginLeft: "auto" }}>afgelast</span>
                  ) : match.scoreA !== null && match.scoreB !== null ? (
                    <span className="match-score" style={{ marginLeft: "auto" }}>{match.scoreA} - {match.scoreB}</span>
                  ) : isPast ? (
                    <span className="match-score-warning" style={{ marginLeft: "auto" }}>⚠</span>
                  ) : (
                    <span className="match-score match-score-empty" style={{ marginLeft: "auto" }}>— : —</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
