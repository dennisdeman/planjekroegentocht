"use client";

import { useMemo } from "react";
import type { ConfigV2, Id, Issue, PlanV2 } from "@core";
import { type PlannerFilterState, hasActiveFilters, matchesGroupSearch } from "./planner-filters";

interface PlannerCardViewProps {
  config: ConfigV2;
  plan: PlanV2;
  issues: Issue[];
  byesByTimeslot: Record<Id, Id[]>;
  filters?: PlannerFilterState;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimeLabel(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  }
  return "--:--";
}

export function PlannerCardView({ config, plan, issues, byesByTimeslot, filters }: PlannerCardViewProps) {
  const groupsById = useMemo(
    () => new Map(config.groups.map((g) => [g.id, g])),
    [config.groups]
  );
  const stationsById = useMemo(
    () => new Map(config.stations.map((s) => [s.id, s])),
    [config.stations]
  );
  const locationsById = useMemo(
    () => new Map(config.locations.map((l) => [l.id, l])),
    [config.locations]
  );
  const activityTypesById = useMemo(
    () => new Map(config.activityTypes.map((a) => [a.id, a])),
    [config.activityTypes]
  );

  const timeslots = useMemo(
    () => [...config.timeslots].sort((a, b) => a.index - b.index),
    [config.timeslots]
  );

  const allocationsBySlot = useMemo(() => {
    const map = new Map<Id, PlanV2["allocations"]>();
    for (const alloc of plan.allocations) {
      const list = map.get(alloc.timeslotId) ?? [];
      list.push(alloc);
      map.set(alloc.timeslotId, list);
    }
    return map;
  }, [plan.allocations]);

  // Filter: timeslots
  const filteredTimeslots = useMemo(() => {
    if (!filters || filters.timeslotIndices.size === 0) return timeslots;
    return timeslots.filter((slot) => slot.kind === "break" || filters.timeslotIndices.has(slot.index));
  }, [timeslots, filters]);

  // Filter: locationIds
  const filterLocationIds = filters?.locationIds ?? new Set<Id>();

  // Highlight: spel
  const highlightSpelIds = filters?.spelIds ?? new Set<Id>();

  // Highlight: group search (whole-word match)
  const groupSearch = (filters?.groupSearch ?? "").trim();
  const highlightGroupIds = useMemo(() => {
    if (!groupSearch) return new Set<Id>();
    const set = new Set<Id>();
    for (const g of config.groups) {
      if (matchesGroupSearch(g.name, groupSearch)) set.add(g.id);
    }
    return set;
  }, [config.groups, groupSearch]);

  const isHighlighting = highlightSpelIds.size > 0 || highlightGroupIds.size > 0;

  // Issues per allocation
  const issuesByAllocation = useMemo(() => {
    const map = new Map<Id, Issue[]>();
    for (const issue of issues) {
      const allocId = issue.refs.allocationId;
      if (!allocId) continue;
      const list = map.get(allocId) ?? [];
      list.push(issue);
      map.set(allocId, list);
    }
    return map;
  }, [issues]);

  return (
    <section className="card">
      <div className="planner-grid-header">
        <h3>Planning</h3>
      </div>
      <div className="card-view-list">
        {filteredTimeslots.map((slot, index) => {
          const slotLabel = slot.label ?? `${formatTimeLabel(slot.start)} - ${formatTimeLabel(slot.end)}`;

          if (slot.kind === "break") {
            const prevActive = filteredTimeslots[index - 1];
            const nextActive = filteredTimeslots[index + 1];
            if (!prevActive || !nextActive) return null;
            return (
              <div key={slot.id} className="card-view-slot card-view-break">
                <div className="card-view-slot-header">
                  <span className="card-view-time">{slotLabel}</span>
                  <span className="card-view-break-label">Pauze / Wissel</span>
                </div>
              </div>
            );
          }

          const allocations = allocationsBySlot.get(slot.id) ?? [];
          const byes = byesByTimeslot[slot.id] ?? [];

          // Group allocations by location for visual grouping
          const byLocation = new Map<Id, typeof allocations>();
          for (const alloc of allocations) {
            const station = stationsById.get(alloc.stationId);
            if (!station) continue;
            const locId = station.locationId;
            // Filter by location if active
            if (filterLocationIds.size > 0 && !filterLocationIds.has(locId)) continue;
            const list = byLocation.get(locId) ?? [];
            list.push(alloc);
            byLocation.set(locId, list);
          }

          // Transition row
          const nextSlot = filteredTimeslots[index + 1];
          const transitionMinutes = nextSlot && slot.kind === "active" && nextSlot.kind === "active"
            ? Math.max(0, Math.round((new Date(nextSlot.start).getTime() - new Date(slot.end).getTime()) / 60_000))
            : 0;

          const visibleLocations = filterLocationIds.size > 0
            ? config.locations.filter((l) => filterLocationIds.has(l.id))
            : config.locations;

          return (
            <div key={slot.id}>
              <div className="card-view-slot">
                <div className="card-view-slot-header">
                  <span className="card-view-time">{slotLabel}</span>
                  <span className="card-view-round">Ronde {index + 1 - filteredTimeslots.slice(0, index).filter((s) => s.kind === "break").length}</span>
                </div>
                <div className="card-view-matches">
                  {visibleLocations.map((location) => {
                    const locAllocs = byLocation.get(location.id);
                    if (!locAllocs || locAllocs.length === 0) return null;

                    return (
                      <div key={location.id} className="card-view-location-group">
                        <div className="card-view-location-name">{location.name}</div>
                        {locAllocs.map((alloc) => {
                          const station = stationsById.get(alloc.stationId);
                          const activity = station ? activityTypesById.get(station.activityTypeId) : null;
                          const allocIssues = issuesByAllocation.get(alloc.id);
                          const hasError = allocIssues?.some((i) => i.severity === "error");
                          const hasWarn = allocIssues?.some((i) => i.severity === "warn");
                          const issueClass = hasError ? "card-view-match-error" : hasWarn ? "card-view-match-warn" : "";

                          // Highlight logic
                          const spelMatch = highlightSpelIds.size > 0 && activity && highlightSpelIds.has(activity.id);
                          const groupMatch = highlightGroupIds.size > 0 && alloc.groupIds.some((gid) => highlightGroupIds.has(gid));
                          const matchHighlight = spelMatch || groupMatch;
                          const dimmed = isHighlighting && !matchHighlight;

                          return (
                            <div key={alloc.id} className={`card-view-match ${issueClass}${matchHighlight ? " card-view-match-highlight" : ""}${dimmed ? " card-view-match-dimmed" : ""}`}>
                              <div className="card-view-spel">{activity?.name ?? station?.name ?? "?"}</div>
                              <div className="card-view-groups">
                                {alloc.groupIds.map((gid, gi) => (
                                  <span key={gid}>
                                    {gi > 0 && <span className="card-view-vs">vs</span>}
                                    <span className={`card-view-group-name${highlightGroupIds.has(gid) ? " group-highlight" : ""}`}>{groupsById.get(gid)?.name ?? gid}</span>
                                  </span>
                                ))}
                              </div>
                              {allocIssues && allocIssues.length > 0 && (
                                <div className="card-view-issues">
                                  {allocIssues.slice(0, 2).map((issue, ii) => (
                                    <span key={ii} className={`card-view-issue-pill card-view-issue-${issue.severity}`}>
                                      {issue.message}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {byes.length > 0 && (
                    <div className="card-view-byes">
                      <span className="card-view-bye-label">Vrij:</span>
                      {byes.map((gid) => (
                        <span key={gid} className={`bye-chip${highlightGroupIds.has(gid) ? " chip-highlight" : ""}`}>{groupsById.get(gid)?.name ?? gid}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {transitionMinutes > 0 && (
                <div className="card-view-transition">
                  Wisseltijd: {transitionMinutes} min
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
