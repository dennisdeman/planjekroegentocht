import type { ConfigV2, Id, PlanV2 } from "./model";
import type { PlanScoreBreakdown } from "./scoring";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanSummaryLine {
  category: "occupancy" | "variety" | "repeats" | "matchup" | "bye";
  severity: "good" | "neutral" | "warn";
  text: string;
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

/**
 * Generate human-readable Dutch summary lines for a plan.
 */
export function generatePlanSummary(
  plan: PlanV2,
  config: ConfigV2,
  score: PlanScoreBreakdown,
): PlanSummaryLine[] {
  const lines: PlanSummaryLine[] = [];

  // ── Bye / oneven pools ──
  // Detect odd groups per pool from the config
  const poolCount = config.segments.length || 1;
  if (config.segmentsEnabled && poolCount >= 2) {
    const groupsPerSegment = new Map<Id, number>();
    for (const g of config.groups) {
      if (g.segmentId) groupsPerSegment.set(g.segmentId, (groupsPerSegment.get(g.segmentId) ?? 0) + 1);
    }
    const poolEntries = [...groupsPerSegment.entries()];
    const segmentById = new Map(config.segments.map((s) => [s.id, s]));
    const oddPools = poolEntries.filter(([, size]) => size % 2 === 1);
    if (oddPools.length > 0) {
      const oddNames = oddPools.map(([id, size]) => `${segmentById.get(id)?.name ?? id} (${size})`);
      const suggestion = oddPools.map(([, size]) => `${size - 1} of ${size + 1}`).join(", ");
      lines.push({
        category: "bye",
        severity: "warn",
        text: oddPools.length === poolEntries.length
          ? `${oddNames.join(", ")}: oneven aantal groepen — elke ronde rust 1 groep. Maak het ${suggestion} per pool voor een beter rooster.`
          : `${oddNames.join(", ")} ${oddPools.length === 1 ? "heeft" : "hebben"} een oneven aantal groepen — daar rust elke ronde 1 groep. Maak het ${suggestion} voor een beter rooster.`,
      });
    }
  }

  // ── Occupancy ──
  if (score.stationOccupancy >= 0.99) {
    lines.push({ category: "occupancy", severity: "good", text: "Alle stations zijn elke ronde bezet." });
  } else {
    const pct = Math.round(score.stationOccupancy * 100);
    lines.push({ category: "occupancy", severity: "warn", text: `Gemiddeld ${pct}% van de stations is bezet per ronde.` });
  }

  // ── Variety ──
  const stationById = new Map(config.stations.map((s) => [s.id, s]));
  const activityById = new Map(config.activityTypes.map((a) => [a.id, a]));
  const totalActivities = config.activityTypes.filter((a) => a.id !== "activity-pause").length;

  const groupUniques = new Map<Id, Set<Id>>();
  for (const alloc of plan.allocations) {
    const station = stationById.get(alloc.stationId);
    if (!station || station.activityTypeId === "activity-pause") continue;
    for (const gid of alloc.groupIds) {
      let set = groupUniques.get(gid);
      if (!set) { set = new Set(); groupUniques.set(gid, set); }
      set.add(station.activityTypeId);
    }
  }

  if (totalActivities > 0 && groupUniques.size > 0) {
    const allPlayAll = [...groupUniques.values()].every((s) => s.size >= totalActivities);
    if (allPlayAll) {
      lines.push({ category: "variety", severity: "good", text: `Alle groepen spelen elk spel precies 1x.` });
    } else {
      const full = [...groupUniques.entries()].filter(([, s]) => s.size >= totalActivities);
      const partial = [...groupUniques.entries()].filter(([, s]) => s.size < totalActivities);
      if (full.length === 0) {
        // No group plays all spellen — compute average unique spellen
        const avgUnique = Math.round([...groupUniques.values()].reduce((sum, s) => sum + s.size, 0) / groupUniques.size);
        lines.push({ category: "variety", severity: "warn", text: `Geen groep speelt alle ${totalActivities} spellen. Gemiddeld speelt een groep ${avgUnique} van de ${totalActivities} spellen.` });
      } else if (partial.length <= 3) {
        const groupById = new Map(config.groups.map((g) => [g.id, g]));
        const details = partial.map(([gid, s]) => {
          const name = groupById.get(gid)?.name ?? gid;
          const missed = totalActivities - s.size;
          return `${name} mist ${missed} spel${missed > 1 ? "len" : ""}`;
        });
        lines.push({ category: "variety", severity: "warn", text: `${full.length} van ${groupUniques.size} groepen spelen elk spel. ${details.join(", ")}.` });
      } else {
        lines.push({ category: "variety", severity: "warn", text: `${full.length} van ${groupUniques.size} groepen spelen alle ${totalActivities} spellen. De rest mist 1 of meer spellen.` });
      }
    }
  }

  // ── Repeats ──
  if (score.repeatCount === 0) {
    lines.push({ category: "repeats", severity: "good", text: "Geen herhalingen." });
  } else {
    // Find specific groups + spellen that repeat
    const groupRepeatDetails = buildRepeatDetails(plan, config, stationById, activityById);
    if (groupRepeatDetails.length <= 4) {
      lines.push({ category: "repeats", severity: "warn", text: groupRepeatDetails.join(" ") });
    } else {
      lines.push({ category: "repeats", severity: "warn", text: `${score.repeatCount} herhalingen verdeeld over meerdere groepen.` });
    }
  }

  // ── Matchup fairness ──
  const maxAllowed = config.constraints.matchupMaxPerPair;
  if (score.matchupMaxEncounters <= maxAllowed) {
    if (maxAllowed === 1) {
      lines.push({ category: "matchup", severity: "good", text: "Elke tegenstander komt maximaal 1x voor." });
    } else {
      lines.push({ category: "matchup", severity: "neutral", text: `Tegenstanders komen maximaal ${score.matchupMaxEncounters}x voor (limiet: ${maxAllowed}).` });
    }
  } else {
    lines.push({ category: "matchup", severity: "warn", text: `Sommige tegenstanders komen ${score.matchupMaxEncounters}x voor (limiet: ${maxAllowed}).` });
  }

  // ── Byes ──
  if (config.pauseActivity) {
    const pauseStationIds = new Set(
      config.stations.filter((s) => s.activityTypeId === "activity-pause").map((s) => s.id),
    );
    const groupById = new Map(config.groups.map((g) => [g.id, g]));
    const timeslotById = new Map(config.timeslots.map((t) => [t.id, t]));

    const byeDetails: string[] = [];
    for (const alloc of plan.allocations) {
      if (!pauseStationIds.has(alloc.stationId)) continue;
      for (const gid of alloc.groupIds) {
        const groupName = groupById.get(gid)?.name ?? gid;
        const ts = timeslotById.get(alloc.timeslotId);
        const roundLabel = ts ? `ronde ${ts.index}` : alloc.timeslotId;
        byeDetails.push(`${groupName} in ${roundLabel}`);
      }
    }

    if (byeDetails.length > 0 && byeDetails.length <= 5) {
      lines.push({
        category: "bye",
        severity: "neutral",
        text: `Pauze-activiteit (${config.pauseActivity.name}): ${byeDetails.join(", ")}.`,
      });
    } else if (byeDetails.length > 5) {
      lines.push({
        category: "bye",
        severity: "neutral",
        text: `${byeDetails.length} groepen doen de pauze-activiteit (${config.pauseActivity.name}).`,
      });
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRepeatDetails(
  plan: PlanV2,
  config: ConfigV2,
  stationById: Map<Id, ConfigV2["stations"][number]>,
  activityById: Map<Id, ConfigV2["activityTypes"][number]>,
): string[] {
  const groupById = new Map(config.groups.map((g) => [g.id, g]));
  const countsByGroup = new Map<Id, Map<Id, number>>();

  for (const alloc of plan.allocations) {
    const station = stationById.get(alloc.stationId);
    if (!station || station.activityTypeId === "activity-pause") continue;
    for (const gid of alloc.groupIds) {
      let byType = countsByGroup.get(gid);
      if (!byType) { byType = new Map(); countsByGroup.set(gid, byType); }
      byType.set(station.activityTypeId, (byType.get(station.activityTypeId) ?? 0) + 1);
    }
  }

  const details: string[] = [];
  for (const [gid, byType] of countsByGroup) {
    const groupName = groupById.get(gid)?.name ?? gid;
    for (const [actId, count] of byType) {
      if (count <= 1) continue;
      const actName = activityById.get(actId)?.name ?? actId;
      details.push(`${groupName} speelt ${actName} ${count}x.`);
    }
  }
  return details;
}
