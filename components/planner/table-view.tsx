"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ConfigV2, Id, Issue, PlanCommandV2, PlanV2 } from "@core";
import { type PlannerFilterState, hasActiveFilters, matchesGroupSearch } from "./planner-filters";

interface PlannerTableViewProps {
  config: ConfigV2;
  plan: PlanV2;
  issues: Issue[];
  byesByTimeslot: Record<Id, Id[]>;
  onCommand: (command: PlanCommandV2) => boolean;
  onBlockedDrop: (reason: string) => void;
  showOpenInNewTabButton?: boolean;
  onOpenInNewTab?: () => string | null;
  filters?: PlannerFilterState;
}

interface DragChipData {
  type: "chip";
  allocationId: Id;
  groupId: Id;
}

interface DropChipData {
  type: "chip-target";
  allocationId: Id;
  groupId: Id;
}

interface DropCellData {
  type: "cell";
  timeslotId: Id;
  stationId: Id;
  allocationId?: Id;
  isBreak: boolean;
}

interface CellIssueState {
  severity: "error" | "warn" | "info";
  messages: string[];
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimeLabel(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  }
  const fallback = value.match(/(\d{2}):(\d{2})/);
  if (fallback) {
    return `${fallback[1]}:${fallback[2]}`;
  }
  return "--:--";
}

function diffMinutes(from: string, to: string): number | null {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
    return Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 60_000));
  }
  return null;
}

function severityRank(value: "error" | "warn" | "info"): number {
  if (value === "error") {
    return 3;
  }
  if (value === "warn") {
    return 2;
  }
  return 1;
}

function isDragChipData(value: unknown): value is DragChipData {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      (value as { type?: string }).type === "chip"
  );
}

function isDropChipData(value: unknown): value is DropChipData {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      (value as { type?: string }).type === "chip-target"
  );
}

function isDropCellData(value: unknown): value is DropCellData {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      (value as { type?: string }).type === "cell"
  );
}

export function PlannerTableView({
  config,
  plan,
  issues,
  byesByTimeslot,
  onCommand,
  onBlockedDrop,
  showOpenInNewTabButton = true,
  onOpenInNewTab,
  filters,
}: PlannerTableViewProps) {
  const [activeDrag, setActiveDrag] = useState<DragChipData | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const groupsById = useMemo(
    () => new Map(config.groups.map((group) => [group.id, group])),
    [config.groups]
  );
  const locationsById = useMemo(
    () => new Map(config.locations.map((location) => [location.id, location])),
    [config.locations]
  );

  const stations = useMemo(
    () => [...config.stations].sort((a, b) => {
      const aIsPause = a.activityTypeId === "activity-pause" ? 1 : 0;
      const bIsPause = b.activityTypeId === "activity-pause" ? 1 : 0;
      if (aIsPause !== bIsPause) return aIsPause - bIsPause;
      return a.name.localeCompare(b.name);
    }),
    [config.stations]
  );
  const stationsByLocation = useMemo(() => {
    const map = new Map<Id, typeof stations>();
    for (const station of stations) {
      const list = map.get(station.locationId) ?? [];
      list.push(station);
      map.set(station.locationId, list);
    }
    const locationOrder = config.locations.map((location) => location.id);
    return locationOrder
      .map((locationId) => ({
        locationId,
        locationName: locationsById.get(locationId)?.name ?? locationId,
        stations: map.get(locationId) ?? [],
      }))
      .filter((entry) => entry.stations.length > 0);
  }, [stations, config.locations, locationsById]);

  const stationsFlat = useMemo(() => stationsByLocation.flatMap((entry) => entry.stations), [stationsByLocation]);

  const hasByes = useMemo(() => {
    return Object.values(byesByTimeslot).some((ids) => ids.length > 0);
  }, [byesByTimeslot]);

  const freeColumns = useMemo(() => {
    if (!hasByes) return [];
    if (!config.segmentsEnabled || config.segments.length === 0) {
      return [{ id: "__all__" as Id, name: "Vrij", all: true }];
    }
    return config.segments.map((segment) => ({ id: segment.id, name: `Vrij (${segment.name})`, all: false }));
  }, [hasByes, config.segmentsEnabled, config.segments]);

  const timeslots = useMemo(
    () => [...config.timeslots].sort((a, b) => a.index - b.index),
    [config.timeslots]
  );

  const allocationsBySlotStation = useMemo(() => {
    const map = new Map<string, PlanV2["allocations"][number]>();
    for (const allocation of plan.allocations) {
      map.set(`${allocation.timeslotId}::${allocation.stationId}`, allocation);
    }
    return map;
  }, [plan.allocations]);

  const allocationsById = useMemo(
    () => new Map(plan.allocations.map((allocation) => [allocation.id, allocation])),
    [plan.allocations]
  );

  // Build lookup: stationId -> activityTypeId
  const stationActivityMap = useMemo(
    () => new Map(config.stations.map((s) => [s.id, s.activityTypeId])),
    [config.stations]
  );

  // Filter: which locations to show
  const filteredStationsByLocation = useMemo(() => {
    if (!filters || filters.locationIds.size === 0) return stationsByLocation;
    return stationsByLocation.filter((entry) => filters.locationIds.has(entry.locationId));
  }, [stationsByLocation, filters]);

  const filteredStationsFlat = useMemo(
    () => filteredStationsByLocation.flatMap((entry) => entry.stations),
    [filteredStationsByLocation]
  );

  // Filter: which timeslots to show
  const filteredTimeslots = useMemo(() => {
    if (!filters || filters.timeslotIndices.size === 0) return timeslots;
    return timeslots.filter((slot) => slot.kind === "break" || filters.timeslotIndices.has(slot.index));
  }, [timeslots, filters]);

  // Highlight: which spelIds are active
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

  const issuesByCell = useMemo(() => {
    const map = new Map<string, CellIssueState>();
    for (const issue of issues) {
      let timeslotId = issue.refs.timeslotId;
      let stationId = issue.refs.stationId;
      if ((!timeslotId || !stationId) && issue.refs.allocationId) {
        const allocation = allocationsById.get(issue.refs.allocationId);
        timeslotId = timeslotId ?? allocation?.timeslotId;
        stationId = stationId ?? allocation?.stationId;
      }
      if (!timeslotId || !stationId) {
        continue;
      }
      const key = `${timeslotId}::${stationId}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { severity: issue.severity, messages: [issue.message] });
        continue;
      }
      const nextSeverity =
        severityRank(issue.severity) > severityRank(existing.severity) ? issue.severity : existing.severity;
      map.set(key, {
        severity: nextSeverity,
        messages: [...existing.messages, issue.message],
      });
    }
    return map;
  }, [issues, allocationsById]);

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (!isDragChipData(data)) {
      setActiveDrag(null);
      return;
    }
    setActiveDrag(data);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const source = event.active.data.current;
    const target = event.over?.data.current;
    setHoverCell(null);
    setActiveDrag(null);

    if (!isDragChipData(source) || !target) {
      return;
    }

    if (isDropChipData(target)) {
      const ok = onCommand({
        type: "swapGroups",
        allocationAId: source.allocationId,
        groupAId: source.groupId,
        allocationBId: target.allocationId,
        groupBId: target.groupId,
      });
      if (!ok) {
        onBlockedDrop("Drop afgekeurd door harde regels.");
      }
      return;
    }

    if (isDropCellData(target)) {
      if (target.isBreak) {
        onBlockedDrop("Drop op pauzeslot is niet toegestaan.");
        return;
      }
      if (!target.allocationId) {
        onBlockedDrop("Drop op lege cel is hier niet toegestaan. Gebruik een bestaande match om te swappen.");
        return;
      }
      const targetAllocation = plan.allocations.find((a) => a.id === target.allocationId);
      if (!targetAllocation || targetAllocation.groupIds.length === 0) {
        onBlockedDrop("Doelallocation ontbreekt.");
        return;
      }
      const replaceGroupId = targetAllocation.groupIds[0];
      const ok = onCommand({
        type: "swapGroups",
        allocationAId: source.allocationId,
        groupAId: source.groupId,
        allocationBId: target.allocationId,
        groupBId: replaceGroupId,
      });
      if (!ok) {
        onBlockedDrop("Drop afgekeurd door harde regels.");
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={(event) => {
        if (event.over?.id && typeof event.over.id === "string") {
          setHoverCell(event.over.id);
        } else {
          setHoverCell(null);
        }
      }}
      onDragEnd={onDragEnd}
    >
      <section className="card">
        <div className="planner-grid-header">
          <h3>Planner grid (Timeslot x Station)</h3>
          {showOpenInNewTabButton ? (
            <button
              type="button"
              className="button-link compact"
              onClick={() => {
                if (typeof window === "undefined") {
                  return;
                }
                const fallbackQuery = new URLSearchParams({
                  gridOnly: "1",
                  configId: config.id,
                  planId: plan.id,
                });
                const fallbackUrl = `/planner?${fallbackQuery.toString()}`;

                const targetUrl = onOpenInNewTab?.() ?? fallbackUrl;
                if (!targetUrl) {
                  return;
                }
                window.open(targetUrl, "_blank");
              }}
            >
              Open grid in nieuwe tab
            </button>
          ) : null}
        </div>
        <div className="planner-grid-wrap">
          <table className="planner-grid">
            <thead>
              <tr>
                <th rowSpan={2}>Tijdslot</th>
                {filteredStationsByLocation.map((locationEntry) => (
                  <th key={locationEntry.locationId} colSpan={locationEntry.stations.length} className="group-header">
                    {locationEntry.locationName}
                  </th>
                ))}
                {freeColumns.map((column) => (
                  <th key={column.id} rowSpan={2}>
                    {column.name}
                  </th>
                ))}
              </tr>
              <tr>
                {filteredStationsByLocation.flatMap((locationEntry) =>
                  locationEntry.stations.map((station) => (
                    <th key={station.id}>
                      <span>{station.name}</span>
                      <small>{locationsById.get(station.locationId)?.name ?? station.locationId}</small>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {filteredTimeslots.flatMap((slot, index) => {
                const nextSlot = filteredTimeslots[index + 1];
                const configuredTransition = Math.max(0, config.scheduleSettings?.transitionMinutes ?? 0);
                const inferredTransition = nextSlot ? diffMinutes(slot.end, nextSlot.start) : null;
                const transitionMinutes =
                  inferredTransition !== null ? inferredTransition : configuredTransition;
                const showTransition = Boolean(
                  nextSlot &&
                    transitionMinutes > 0 &&
                    slot.kind === "active" &&
                    nextSlot.kind === "active"
                );
                const transitionLabel = showTransition
                  ? `Wisseltijd: ${transitionMinutes} min (${formatTimeLabel(slot.end)} - ${formatTimeLabel(nextSlot!.start)})`
                  : null;

                if (slot.kind === "break") {
                  // Hide breaks that are between filtered-out timeslots
                  const prevActive = filteredTimeslots[index - 1];
                  const nextActive = filteredTimeslots[index + 1];
                  if (!prevActive || !nextActive) return [];
                  return (
                    [
                      <tr key={slot.id} className="break-row">
                        <td>{slot.label ?? slot.id}</td>
                        <td colSpan={filteredStationsFlat.length + freeColumns.length}>Pauze / Wissel</td>
                      </tr>,
                      showTransition && transitionLabel ? (
                        <tr key={`switch-${slot.id}-${nextSlot.id}`} className="timeslot-transition-row planner-transition-row">
                          <td colSpan={filteredStationsFlat.length + freeColumns.length + 1}>{transitionLabel}</td>
                        </tr>
                      ) : null,
                    ]
                  );
                }
                return [
                  <tr key={slot.id}>
                    <td>{slot.label ?? slot.id}</td>
                    {filteredStationsFlat.map((station) => {
                      const allocation = allocationsBySlotStation.get(`${slot.id}::${station.id}`) ?? null;
                      const overId = `cell:${slot.id}:${station.id}`;
                      const issue = issuesByCell.get(`${slot.id}::${station.id}`);
                      const issueClass = issue ? `cell-issue-${issue.severity}` : "";

                      // Spel highlight
                      const cellActivityId = stationActivityMap.get(station.id);
                      const spelMatch = highlightSpelIds.size > 0 && cellActivityId && highlightSpelIds.has(cellActivityId);
                      // Group highlight
                      const groupMatch = highlightGroupIds.size > 0 && allocation?.groupIds.some((gid) => highlightGroupIds.has(gid));
                      const cellHighlight = spelMatch || groupMatch;
                      const dimmed = isHighlighting && !cellHighlight;

                      return (
                        <td
                          key={station.id}
                          className={`planner-cell ${issueClass}${cellHighlight ? " cell-highlight" : ""}${dimmed ? " cell-dimmed" : ""}`}
                          title={issue?.messages.slice(0, 3).join("\n") ?? ""}
                        >
                          {issue ? (
                            <span className={`cell-issue-pill cell-issue-pill-${issue.severity}`}>
                              {issue.messages.length}
                            </span>
                          ) : null}
                          <CellDropTarget
                            id={overId}
                            data={{
                              type: "cell",
                              timeslotId: slot.id,
                              stationId: station.id,
                              allocationId: allocation?.id,
                              isBreak: false,
                            }}
                            className={hoverCell === overId ? "drop-over" : ""}
                          >
                            {allocation ? (
                              <div className="cell-alloc">
                                {allocation.groupIds.map((groupId, groupIndex) => {
                                  const chipHighlight = highlightGroupIds.size > 0 && highlightGroupIds.has(groupId);
                                  return (
                                    <ChipDropTarget
                                      key={`${allocation.id}-${groupId}`}
                                      id={`chip:${allocation.id}:${groupId}`}
                                      data={{
                                        type: "chip-target",
                                        allocationId: allocation.id,
                                        groupId,
                                      }}
                                    >
                                      <DraggableChip
                                        allocationId={allocation.id}
                                        groupId={groupId}
                                        label={groupsById.get(groupId)?.name ?? groupId}
                                        highlight={chipHighlight}
                                      />
                                      {groupIndex === 0 && allocation.groupIds.length > 1 ? (
                                        <span className="vs-label">vs</span>
                                      ) : null}
                                    </ChipDropTarget>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="muted">-</span>
                            )}
                          </CellDropTarget>
                        </td>
                      );
                    })}
                    {freeColumns.map((column) => {
                      const ids = (byesByTimeslot[slot.id] ?? []).filter((groupId) => {
                        if (column.all) {
                          return true;
                        }
                        return groupsById.get(groupId)?.segmentId === column.id;
                      });
                      return (
                        <td key={`${slot.id}-${column.id}`} className="bye-column-cell">
                          {ids.length === 0 ? <span className="muted">-</span> : null}
                          {ids.map((groupId) => (
                            <span className={`bye-chip${highlightGroupIds.has(groupId) ? " chip-highlight" : ""}`} key={`${slot.id}-${column.id}-${groupId}`}>
                              {groupsById.get(groupId)?.name ?? groupId}
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>,
                  showTransition && transitionLabel ? (
                    <tr key={`switch-${slot.id}-${nextSlot.id}`} className="timeslot-transition-row planner-transition-row">
                      <td colSpan={filteredStationsFlat.length + freeColumns.length + 1}>{transitionLabel}</td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>
      <DragOverlay>
        {activeDrag ? (
          <span className="chip drag-overlay-chip">
            {groupsById.get(activeDrag.groupId)?.name ?? activeDrag.groupId}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DraggableChip(props: { allocationId: Id; groupId: Id; label: string; highlight?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag:${props.allocationId}:${props.groupId}`,
    data: {
      type: "chip",
      allocationId: props.allocationId,
      groupId: props.groupId,
    } satisfies DragChipData,
  });

  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.45 : 1 }}
      className={`chip${props.highlight ? " chip-highlight" : ""}`}
      {...listeners}
      {...attributes}
      title="Sleep om te wisselen"
    >
      {props.label}
    </span>
  );
}

function ChipDropTarget(props: {
  id: string;
  data: DropChipData;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: props.id,
    data: props.data,
  });
  return (
    <span ref={setNodeRef} className={isOver ? "chip-target drop-over" : "chip-target"}>
      {props.children}
    </span>
  );
}

function CellDropTarget(props: {
  id: string;
  data: DropCellData;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: props.id,
    data: props.data,
  });
  return (
    <div
      ref={setNodeRef}
      className={`cell-drop ${props.className ?? ""} ${isOver ? "drop-over" : ""}`.trim()}
    >
      {props.children}
    </div>
  );
}
