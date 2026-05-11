"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import type { MatchResult, Id, GroupV2, StationV2, LocationV2, ActivityTypeV2, TimeslotV2, LiveCursor } from "@core";

interface MatchScheduleGridProps {
  matches: MatchResult[];
  config: { timeslots: TimeslotV2[]; stations: StationV2[]; locations: LocationV2[] };
  cursor: LiveCursor | null;
  allTimeslots: TimeslotV2[];
  activeTimeslots: TimeslotV2[];
  filteredStations: StationV2[];
  groupById: Map<Id, GroupV2>;
  stationById: Map<Id, StationV2>;
  locationById: Map<Id, LocationV2>;
  activityTypeById: Map<Id, ActivityTypeV2>;
  stationSupervisorStatus?: Record<string, { status: string; names: string[] }>;
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

export function MatchScheduleGrid({
  matches,
  cursor,
  allTimeslots,
  activeTimeslots,
  filteredStations,
  groupById,
  locationById,
  activityTypeById,
  stationSupervisorStatus,
  filterGroupId,
  autoScroll,
  onMatchClick,
  onByeClick,
  onColumnHeaderClick,
}: MatchScheduleGridProps) {
  const activeColRef = useRef<HTMLTableCellElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const matchLookup = useMemo(() => {
    const m = new Map<string, MatchResult>();
    for (const match of matches) {
      m.set(`${match.timeslotIndex}::${match.stationId}`, match);
    }
    return m;
  }, [matches]);

  const roundProgress = useMemo(() => {
    const m = new Map<number, { total: number; completed: number; cancelled: number }>();
    for (const ts of activeTimeslots) {
      m.set(ts.index, { total: 0, completed: 0, cancelled: 0 });
    }
    for (const match of matches) {
      const p = m.get(match.timeslotIndex);
      if (!p) continue;
      if (match.groupBId === null) continue;
      p.total++;
      if (match.status === "completed") p.completed++;
      if (match.status === "cancelled") p.cancelled++;
    }
    return m;
  }, [matches, activeTimeslots]);

  const currentTimeslotIndex = cursor?.currentTimeslotIndex ?? null;
  const pastTimeslotIndices = useMemo(() => {
    if (!cursor) return new Set<number>();
    const set = new Set<number>();
    if (cursor.phase === "after_last") {
      for (const ts of activeTimeslots) set.add(ts.index);
    } else if (cursor.currentTimeslotIndex !== null) {
      for (const ts of activeTimeslots) {
        if (ts.index < cursor.currentTimeslotIndex) set.add(ts.index);
      }
    } else if (cursor.phase === "transition" && cursor.nextTimeslotIndex !== null) {
      for (const ts of activeTimeslots) {
        if (ts.index < cursor.nextTimeslotIndex) set.add(ts.index);
      }
    }
    return set;
  }, [cursor, activeTimeslots]);

  const stationsByLocation = useMemo(() => {
    const map = new Map<string, StationV2[]>();
    const order: string[] = [];
    for (const station of filteredStations) {
      if (!map.has(station.locationId)) {
        map.set(station.locationId, []);
        order.push(station.locationId);
      }
      map.get(station.locationId)!.push(station);
    }
    return order.map((locId) => ({
      locationId: locId,
      locationName: locationById.get(locId)?.name ?? locId,
      stations: map.get(locId)!,
    }));
  }, [filteredStations, locationById]);

  const totalGridCols = useMemo(() => {
    let cols = 2; // station + begeleider
    for (let i = 0; i < allTimeslots.length; i++) {
      cols++;
      if (allTimeslots[i].kind === "active" && i > 0 && allTimeslots[i - 1].kind === "active") {
        const gapMs = new Date(allTimeslots[i].start).getTime() - new Date(allTimeslots[i - 1].end).getTime();
        if (gapMs > 0) cols++;
      }
    }
    return cols;
  }, [allTimeslots]);

  useEffect(() => {
    if (autoScroll && activeColRef.current && wrapRef.current) {
      const wrap = wrapRef.current;
      const th = activeColRef.current;
      const scrollLeft = th.offsetLeft - wrap.clientWidth / 2 + th.clientWidth / 2;
      wrap.scrollTo({ left: Math.max(0, scrollLeft), behavior: "smooth" });
    }
  }, [autoScroll, currentTimeslotIndex]);

  function cellClass(match: MatchResult | undefined, tsIndex: number): string {
    const classes = ["match-cell"];

    if (!match) {
      classes.push("match-cell-empty");
      return classes.join(" ");
    }

    if (match.groupBId === null) {
      classes.push("match-cell-bye");
      return classes.join(" ");
    }

    const isActive = tsIndex === currentTimeslotIndex;
    const isPast = pastTimeslotIndices.has(tsIndex);

    if (match.status === "cancelled") {
      classes.push("match-cell-cancelled");
    } else if (match.status === "completed" && match.scoreA !== null && match.scoreB !== null) {
      classes.push("match-cell-completed");
    } else if (isPast && match.status !== "completed") {
      classes.push("match-cell-missing");
    }

    if (isActive) classes.push("match-grid-cell-active");

    if (filterGroupId && (match.groupAId === filterGroupId || match.groupBId === filterGroupId)) {
      classes.push("match-cell-highlight");
    } else if (filterGroupId) {
      classes.push("match-cell-dimmed");
    }

    return classes.join(" ");
  }

  function renderCellContent(match: MatchResult | undefined) {
    if (!match) return <span className="muted">-</span>;

    if (match.groupBId === null) {
      const groupName = groupById.get(match.groupAId)?.name ?? "?";
      return <span className="muted" style={{ fontSize: "0.78rem" }}>bye · {groupName}</span>;
    }

    const nameA = groupById.get(match.groupAId)?.name ?? "?";
    const nameB = groupById.get(match.groupBId)?.name ?? "?";

    if (match.status === "cancelled") {
      return (
        <span className="match-cell-cancelled-text" title={match.cancelNote ?? undefined}>
          afgelast
        </span>
      );
    }

    const hasScore = match.scoreA !== null && match.scoreB !== null;

    return (
      <div className="match-cell-content">
        <div className="match-cell-teams">{nameA}<br /><span className="match-cell-vs">vs</span><br />{nameB}</div>
        {hasScore ? (
          <div className="match-score">{match.scoreA} - {match.scoreB}</div>
        ) : (
          <div className="match-score match-score-empty">— : —</div>
        )}
      </div>
    );
  }

  return (
    <div className="match-grid-wrap" ref={wrapRef}>
      <table className="match-grid">
        <thead>
          <tr>
            <th className="match-grid-station-col">Station</th>
            <th className="match-grid-supervisor-col">Begeleider</th>
            {(() => {
              let roundNum = 0;
              const cols: React.ReactNode[] = [];
              for (let i = 0; i < allTimeslots.length; i++) {
                const ts = allTimeslots[i];

                if (ts.kind === "break") {
                  cols.push(
                    <th key={`break-${ts.index}`} className="match-grid-break-col">
                      <div className="match-grid-round-label">Pauze</div>
                      <div className="match-grid-round-time">{formatTime(ts.start)}</div>
                    </th>
                  );
                  continue;
                }

                // Wisseltijd kolom vóór deze ronde (als er een gap is ten opzichte van de vorige actieve ronde)
                if (roundNum > 0 && i > 0) {
                  const prev = allTimeslots[i - 1];
                  if (prev.kind === "active") {
                    const gapMs = new Date(ts.start).getTime() - new Date(prev.end).getTime();
                    if (gapMs > 0) {
                      const isTransitionActive = cursor?.phase === "transition" && cursor?.nextTimeslotIndex === ts.index;
                      cols.push(
                        <th key={`w-${ts.index}`} className={`match-grid-transition-col${isTransitionActive ? " match-grid-round-active" : ""}`}>
                          <div className="match-grid-round-label">W</div>
                        </th>
                      );
                    }
                  }
                }

                roundNum++;
                const isActive = ts.index === currentTimeslotIndex;
                const progress = roundProgress.get(ts.index);
                const progressLabel = progress && progress.total > 0
                  ? `${progress.completed}/${progress.total}`
                  : "";
                const allDone = progress && progress.total > 0 && progress.completed + progress.cancelled >= progress.total;

                cols.push(
                  <th
                    key={ts.index}
                    ref={isActive ? activeColRef : undefined}
                    className={`match-grid-round-col${isActive ? " match-grid-round-active" : ""}`}
                    onClick={(e) => onColumnHeaderClick(ts.index, e.currentTarget)}
                  >
                    <div className="match-grid-round-label">Ronde {roundNum}</div>
                    <div className="match-grid-round-time">{formatTime(ts.start)}</div>
                    {progressLabel && (
                      <div className={`match-grid-round-progress${allDone ? " all-done" : ""}`}>
                        {progressLabel} {allDone ? "✓" : ""}
                      </div>
                    )}
                  </th>
                );
              }
              return cols;
            })()}
          </tr>
        </thead>
        <tbody>
          {stationsByLocation.map((group) => (
            <Fragment key={group.locationId}>
              {stationsByLocation.length > 1 && (
                <tr className="match-grid-location-row">
                  <td colSpan={totalGridCols}>{group.locationName}</td>
                </tr>
              )}
              {group.stations.map((station) => {
                const activity = activityTypeById.get(station.activityTypeId);
                const stationLabel = activity ? `${activity.name}` : station.name;

                return (
                  <tr key={station.id}>
                    <td className="match-grid-station-cell">
                      <div className="match-grid-station-name">{stationLabel}</div>
                      <div className="match-grid-station-location">{group.locationName}</div>
                    </td>
                    <td className="match-grid-supervisor-cell">
                      {(() => {
                        const sv = stationSupervisorStatus?.[station.id];
                        if (!sv || sv.status === "never_opened") return <span style={{ color: "var(--error, #dc2626)" }}>✕</span>;
                        if (sv.status === "unknown" || sv.names.length === 0) return <span className="muted">Onbekend</span>;
                        return <span>{sv.names.join(", ")}</span>;
                      })()}
                    </td>
                    {(() => {
                      const cells: React.ReactNode[] = [];
                      for (let i = 0; i < allTimeslots.length; i++) {
                        const ts = allTimeslots[i];
                        if (ts.kind === "break") {
                          cells.push(<td key={`break-${ts.index}`} className="match-cell-break" />);
                          continue;
                        }
                        if (i > 0 && allTimeslots[i - 1].kind === "active") {
                          const gapMs = new Date(ts.start).getTime() - new Date(allTimeslots[i - 1].end).getTime();
                          if (gapMs > 0) {
                            const isWActive = cursor?.phase === "transition" && cursor?.nextTimeslotIndex === ts.index;
                            cells.push(<td key={`w-${ts.index}`} className={`match-cell-transition${isWActive ? " match-grid-cell-active" : ""}`} />);
                          }
                        }
                        const match = matchLookup.get(`${ts.index}::${station.id}`);
                        const isBye = match?.groupBId === null;
                        cells.push(
                          <td
                            key={ts.index}
                            className={cellClass(match, ts.index)}
                            onClick={(e) => {
                              if (!match) return;
                              if (isBye) {
                                onByeClick(match, e.currentTarget);
                              } else {
                                onMatchClick(match);
                              }
                            }}
                          >
                            {renderCellContent(match)}
                          </td>
                        );
                      }
                      return cells;
                    })()}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
