"use client";

import { useEffect, useRef } from "react";
import type { MatchResult, Id, GroupV2, StationV2, LocationV2, ActivityTypeV2, TimeslotV2 } from "@core";

interface ByeInfoPopoverProps {
  match: MatchResult;
  matches: MatchResult[];
  anchor: DOMRect;
  activeTimeslots: TimeslotV2[];
  groupById: Map<Id, GroupV2>;
  stationById: Map<Id, StationV2>;
  locationById: Map<Id, LocationV2>;
  activityTypeById: Map<Id, ActivityTypeV2>;
  onClose: () => void;
}

export function ByeInfoPopover({
  match,
  matches,
  anchor,
  activeTimeslots,
  groupById,
  stationById,
  locationById,
  activityTypeById,
  onClose,
}: ByeInfoPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const groupName = groupById.get(match.groupAId)?.name ?? "?";

  const nextMatch = matches.find(
    (m) => m.timeslotIndex > match.timeslotIndex &&
      (m.groupAId === match.groupAId || m.groupBId === match.groupAId) &&
      m.groupBId !== null
  );

  let nextInfo: string | null = null;
  if (nextMatch) {
    const ts = activeTimeslots.find((t) => t.index === nextMatch.timeslotIndex);
    const station = stationById.get(nextMatch.stationId);
    const activity = station ? activityTypeById.get(station.activityTypeId) : undefined;
    const location = station ? locationById.get(station.locationId) : undefined;
    const opponentId = nextMatch.groupAId === match.groupAId ? nextMatch.groupBId : nextMatch.groupAId;
    const opponentName = opponentId ? groupById.get(opponentId)?.name ?? "?" : "?";
    const stationLabel = `${activity?.name ?? station?.name ?? "?"} @ ${location?.name ?? "?"}`;
    nextInfo = `Ronde ${nextMatch.timeslotIndex + 1} — ${stationLabel} vs ${opponentName}`;
  }

  const top = anchor.bottom + 6;
  const left = Math.max(8, anchor.left + anchor.width / 2 - 140);

  return (
    <div
      ref={ref}
      className="bye-popover"
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 1000,
        width: 280,
        padding: "10px 14px",
        background: "var(--card, #fff)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        fontSize: "0.85rem",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{groupName}</div>
      <div className="muted" style={{ marginBottom: nextInfo ? 8 : 0 }}>Pauze deze ronde</div>
      {nextInfo && (
        <div>
          <span className="muted" style={{ fontSize: "0.78rem" }}>Hierna: </span>
          <span style={{ fontSize: "0.82rem" }}>{nextInfo}</span>
        </div>
      )}
    </div>
  );
}
