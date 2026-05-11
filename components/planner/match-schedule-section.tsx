"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchResult, Id, GroupV2, StationV2, LocationV2, ActivityTypeV2, TimeslotV2, LiveCursor } from "@core";
import { MatchScheduleGrid } from "./match-schedule-grid";
import { MatchScheduleCards } from "./match-schedule-cards";
import { MatchDetailModal } from "./match-detail-modal";
import { ByeInfoPopover } from "./bye-info-popover";
import { RoundColumnMenu } from "./round-column-menu";

export interface MatchConfig {
  groups: GroupV2[];
  stations: StationV2[];
  locations: LocationV2[];
  activityTypes: ActivityTypeV2[];
  timeslots: TimeslotV2[];
}

interface MatchScheduleSectionProps {
  kroegentochtId: string;
}

export function MatchScheduleSection({ kroegentochtId }: MatchScheduleSectionProps) {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [config, setConfig] = useState<MatchConfig | null>(null);
  const [cursor, setCursor] = useState<LiveCursor | null>(null);
  const [supervisorNames, setSupervisorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<"grid" | "cards">("grid");
  const [autoScroll, setAutoScroll] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setAutoScroll(localStorage.getItem("match-grid-autoscroll") !== "false");
    }
  }, []);
  const [filterLocationId, setFilterLocationId] = useState<string>("");
  const [filterGroupId, setFilterGroupId] = useState<string>("");

  const [stationSupervisors, setStationSupervisors] = useState<Record<string, string[]>>({});
  const [stationSupervisorStatus, setStationSupervisorStatus] = useState<Record<string, { status: string; names: string[] }>>({});
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [byePopover, setByePopover] = useState<{ match: MatchResult; anchor: DOMRect } | null>(null);
  const [columnMenu, setColumnMenu] = useState<{ timeslotIndex: number; anchor: DOMRect } | null>(null);

  const cancelledRef = useRef(false);

  const fetchData = useCallback(() => {
    fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/matches`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelledRef.current) return;
        if (d.matches) setMatches(d.matches);
        if (d.config) setConfig(d.config);
        if (d.cursor) setCursor(d.cursor);
        if (d.supervisorNames) setSupervisorNames(d.supervisorNames);
        if (d.stationSupervisors) setStationSupervisors(d.stationSupervisors);
        if (d.stationSupervisorStatus) setStationSupervisorStatus(d.stationSupervisorStatus);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [kroegentochtId]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchData();
    const id = setInterval(fetchData, 10_000);
    return () => { cancelledRef.current = true; clearInterval(id); };
  }, [fetchData]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setViewMode("cards");
    }
  }, []);

  const groupById = useMemo(() => {
    const m = new Map<Id, GroupV2>();
    config?.groups.forEach((g) => m.set(g.id, g));
    return m;
  }, [config?.groups]);

  const stationById = useMemo(() => {
    const m = new Map<Id, StationV2>();
    config?.stations.forEach((s) => m.set(s.id, s));
    return m;
  }, [config?.stations]);

  const locationById = useMemo(() => {
    const m = new Map<Id, LocationV2>();
    config?.locations.forEach((l) => m.set(l.id, l));
    return m;
  }, [config?.locations]);

  const activityTypeById = useMemo(() => {
    const m = new Map<Id, ActivityTypeV2>();
    config?.activityTypes.forEach((a) => m.set(a.id, a));
    return m;
  }, [config?.activityTypes]);

  const allTimeslots = useMemo(() => {
    if (!config) return [];
    return [...config.timeslots].sort((a, b) => a.index - b.index);
  }, [config]);

  const activeTimeslots = useMemo(() => {
    return allTimeslots.filter((t) => t.kind === "active");
  }, [allTimeslots]);

  const filteredStations = useMemo(() => {
    if (!config) return [];
    const sorted = [...config.stations].sort((a, b) => a.name.localeCompare(b.name));
    if (!filterLocationId) return sorted;
    return sorted.filter((s) => s.locationId === filterLocationId);
  }, [config, filterLocationId]);

  const handleMatchClick = useCallback((match: MatchResult) => {
    setSelectedMatch(match);
  }, []);

  const handleByeClick = useCallback((match: MatchResult, el: HTMLElement) => {
    setByePopover({ match, anchor: el.getBoundingClientRect() });
  }, []);

  const handleColumnHeaderClick = useCallback((timeslotIndex: number, el: HTMLElement) => {
    setColumnMenu({ timeslotIndex, anchor: el.getBoundingClientRect() });
  }, []);

  const handleMatchSaved = useCallback(() => {
    setSelectedMatch(null);
    fetchData();
  }, [fetchData]);

  const handleBulkAction = useCallback(async (action: string, timeslotIndex: number, cancelReason?: string) => {
    try {
      const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/matches/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, timeslotIndex, cancelReason }),
      });
      if (!res.ok) throw new Error("Bulk-actie mislukt.");
      setColumnMenu(null);
      fetchData();
    } catch {
      // keep menu open on error
    }
  }, [kroegentochtId, fetchData]);

  if (loading || !config) {
    return (
      <section className="card" style={{ marginTop: 12 }}>
        <p className="muted" style={{ textAlign: "center", padding: 20 }}>Spelschema laden...</p>
      </section>
    );
  }

  if (matches.length === 0) return null;

  const sharedProps = {
    matches,
    config,
    cursor,
    allTimeslots,
    activeTimeslots,
    filteredStations,
    groupById,
    stationById,
    locationById,
    activityTypeById,
    filterGroupId,
    autoScroll,
    stationSupervisorStatus,
    onMatchClick: handleMatchClick,
    onByeClick: handleByeClick,
    onColumnHeaderClick: handleColumnHeaderClick,
  };

  return (
    <>
      <section className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Spelschema</h3>
          <div className="print-hide" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {config.locations.length > 1 && (
              <select
                value={filterLocationId}
                onChange={(e) => setFilterLocationId(e.target.value)}
                style={{ fontSize: "0.82rem", padding: "4px 8px" }}
              >
                <option value="">Alle locaties</option>
                {config.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}
            {config.groups.length > 1 && (
              <select
                value={filterGroupId}
                onChange={(e) => setFilterGroupId(e.target.value)}
                style={{ fontSize: "0.82rem", padding: "4px 8px" }}
              >
                <option value="">Alle groepen</option>
                {config.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem", cursor: "pointer" }}>
              <input type="checkbox" checked={autoScroll} onChange={(e) => { setAutoScroll(e.target.checked); localStorage.setItem("match-grid-autoscroll", String(e.target.checked)); }} />
              Auto-scroll
            </label>
            <button type="button" className="btn-ghost btn-sm" onClick={() => window.print()}>
              Print
            </button>
            <div className="planner-view-toggle">
              <button type="button" className={viewMode === "grid" ? "is-active" : ""} onClick={() => setViewMode("grid")}>Grid</button>
              <button type="button" className={viewMode === "cards" ? "is-active" : ""} onClick={() => setViewMode("cards")}>Kaarten</button>
            </div>
          </div>
        </div>

        {viewMode === "grid" ? (
          <MatchScheduleGrid {...sharedProps} />
        ) : (
          <MatchScheduleCards {...sharedProps} />
        )}
      </section>

      {selectedMatch && config && (
        <MatchDetailModal
          kroegentochtId={kroegentochtId}
          match={selectedMatch}
          config={config}
          activeTimeslots={activeTimeslots}
          groupById={groupById}
          stationById={stationById}
          locationById={locationById}
          activityTypeById={activityTypeById}
          supervisorNames={supervisorNames}
          stationSupervisors={stationSupervisors}
          onClose={() => setSelectedMatch(null)}
          onSaved={handleMatchSaved}
        />
      )}

      {byePopover && (
        <ByeInfoPopover
          match={byePopover.match}
          matches={matches}
          anchor={byePopover.anchor}
          activeTimeslots={activeTimeslots}
          groupById={groupById}
          stationById={stationById}
          locationById={locationById}
          activityTypeById={activityTypeById}
          onClose={() => setByePopover(null)}
        />
      )}

      {columnMenu && (
        <RoundColumnMenu
          kroegentochtId={kroegentochtId}
          timeslotIndex={columnMenu.timeslotIndex}
          anchor={columnMenu.anchor}
          matches={matches}
          activeTimeslots={activeTimeslots}
          onBulkAction={handleBulkAction}
          onClose={() => setColumnMenu(null)}
        />
      )}
    </>
  );
}
