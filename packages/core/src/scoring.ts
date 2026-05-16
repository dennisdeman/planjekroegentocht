import type { ConfigV2, Id, PlanV2 } from "./model";
import { analyzePlanFeasibility, type FeasibilityReport } from "./feasibility";

// ---------------------------------------------------------------------------
// Weights per modus — zie `docs/generator-design.md` §3.4
// ---------------------------------------------------------------------------

const WEIGHTS_ALL_SPELLEN = {
  spelRepeatPenalty: 5.0,
  spelVariety: 3.0,
  matchupCeilingPenalty: 1.5,
  stationOccupancy: 1.0,
};

const WEIGHTS_ROUND_ROBIN = {
  matchupCeilingPenalty: 5.0,
  spelRepeatPenalty: 3.0,
  spelVariety: 1.5,
  stationOccupancy: 1.0,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlanScoreBreakdown {
  mode: "all-spellen" | "round-robin";

  /** 0.0 (all empty) to 1.0 (all stations occupied every active round) */
  stationOccupancy: number;

  /** Average fraction of unique spellen played per group (0.0 to 1.0) */
  spelVariety: number;

  /** Total repeated spellen across all groups (0 = perfect) */
  repeatCount: number;

  /** Wiskundig minimum uit feasibility — context voor de normalisatie */
  lowerBoundSpelRepeats: number;

  /**
   * Genormaliseerde spel-herhaling penalty: 1.0 = wiskundig minimum
   * bereikt (ook als dat > 0 is), 0.0 = worst-case overschrijding.
   * Formule: `1 - excessRepeats / maxUseful`.
   */
  spelRepeatPenalty: number;

  /** Max times any pair of groups plays against each other */
  matchupMaxEncounters: number;

  /** Wiskundig minimum uit feasibility */
  lowerBoundMatchupCeiling: number;

  /**
   * Genormaliseerde matchup-plafond penalty: 1.0 = geen paren boven het
   * wiskundige plafond, 0.0 = worst-case.
   * Vervangt de oude `matchupFairness` (coefficient of variation), die
   * gelijke spreiding beloonde ook als die hoog was.
   */
  matchupCeilingPenalty: number;

  /** Composite weighted score: higher is better */
  totalScore: number;
}

// ---------------------------------------------------------------------------
// Station occupancy (ongewijzigd t.o.v. de vorige versie)
// ---------------------------------------------------------------------------

/**
 * Fraction of stations that are occupied per active timeslot.
 * `byeStationIds` are excluded from the denominator (pause-stations).
 */
export function computeStationOccupancy(
  plan: PlanV2,
  config: ConfigV2,
  byeStationIds?: Set<Id>,
): number {
  const activeTimeslots = config.timeslots.filter((ts) => ts.kind === "active");
  if (activeTimeslots.length === 0) return 1;

  const stationLocationMap = new Map(config.stations.map((s) => [s.id, s.locationId]));
  const allStationIds = new Set(config.stations.map((s) => s.id));

  const blockLocationMap = new Map<string, Id>();
  if (config.locationBlocks) {
    for (const block of config.locationBlocks) {
      for (const tsId of block.timeslotIds) {
        for (const [segId, locId] of Object.entries(block.segmentLocationMap)) {
          blockLocationMap.set(`${tsId}:${segId}`, locId);
        }
      }
    }
  }

  let totalOccupied = 0;
  let totalAvailable = 0;

  for (const ts of activeTimeslots) {
    let availableStations: Id[];

    if (blockLocationMap.size > 0) {
      const allowedLocationIds = new Set<Id>();
      for (const [key, locId] of blockLocationMap) {
        if (key.startsWith(`${ts.id}:`)) {
          allowedLocationIds.add(locId);
        }
      }
      if (allowedLocationIds.size > 0) {
        availableStations = config.stations
          .filter((s) => allowedLocationIds.has(s.locationId))
          .map((s) => s.id);
      } else {
        availableStations = [...allStationIds];
      }
    } else {
      availableStations = [...allStationIds];
    }

    if (byeStationIds && byeStationIds.size > 0) {
      availableStations = availableStations.filter((id) => !byeStationIds.has(id));
    }

    if (availableStations.length === 0) continue;

    const occupiedStations = new Set<Id>();
    for (const alloc of plan.allocations) {
      if (alloc.timeslotId === ts.id && availableStations.includes(alloc.stationId)) {
        occupiedStations.add(alloc.stationId);
      }
    }

    totalOccupied += occupiedStations.size;
    totalAvailable += availableStations.length;
  }

  return totalAvailable > 0 ? totalOccupied / totalAvailable : 1;
}

// ---------------------------------------------------------------------------
// Spel variety (ongewijzigd)
// ---------------------------------------------------------------------------

export function computeSpelVariety(
  plan: PlanV2,
  config: ConfigV2,
): number {
  const stationById = new Map(config.stations.map((s) => [s.id, s]));
  const totalActivityTypes = config.activityTypes.filter(
    (a) => a.id !== "activity-pause" && a.id !== "activity-kroegbezoek"
  ).length;
  if (totalActivityTypes === 0) return 1;

  const groupActivities = new Map<Id, Set<Id>>();

  for (const alloc of plan.allocations) {
    const station = stationById.get(alloc.stationId);
    if (!station || station.activityTypeId === "activity-pause" || station.activityTypeId === "activity-kroegbezoek") continue;
    for (const groupId of alloc.groupIds) {
      let set = groupActivities.get(groupId);
      if (!set) {
        set = new Set();
        groupActivities.set(groupId, set);
      }
      set.add(station.activityTypeId);
    }
  }

  if (groupActivities.size === 0) return 0;

  let totalFraction = 0;
  for (const activities of groupActivities.values()) {
    totalFraction += Math.min(1, activities.size / totalActivityTypes);
  }

  return totalFraction / groupActivities.size;
}

// ---------------------------------------------------------------------------
// Repeat count (ongewijzigd)
// ---------------------------------------------------------------------------

export function computeRepeatCount(
  plan: PlanV2,
  config: ConfigV2,
): number {
  const stationById = new Map(config.stations.map((s) => [s.id, s]));
  const countsByGroup = new Map<Id, Map<Id, number>>();

  for (const alloc of plan.allocations) {
    const station = stationById.get(alloc.stationId);
    if (!station || station.activityTypeId === "activity-pause" || station.activityTypeId === "activity-kroegbezoek") continue;
    for (const groupId of alloc.groupIds) {
      let byType = countsByGroup.get(groupId);
      if (!byType) {
        byType = new Map();
        countsByGroup.set(groupId, byType);
      }
      byType.set(station.activityTypeId, (byType.get(station.activityTypeId) ?? 0) + 1);
    }
  }

  let penalty = 0;
  for (const byType of countsByGroup.values()) {
    for (const count of byType.values()) {
      penalty += Math.max(0, count - 1);
    }
  }
  return penalty;
}

// ---------------------------------------------------------------------------
// Matchup encounter counts
// ---------------------------------------------------------------------------

function pairKey(a: Id, b: Id): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Berekent matchup-encounter verdeling over alle allocaties.
 */
export function computeMatchupCounts(
  plan: PlanV2,
): { pairCounts: Map<string, number>; maxEncounters: number } {
  const pairCounts = new Map<string, number>();

  for (const alloc of plan.allocations) {
    if (alloc.groupIds.length < 2) continue;
    for (let i = 0; i < alloc.groupIds.length; i++) {
      for (let j = i + 1; j < alloc.groupIds.length; j++) {
        const key = pairKey(alloc.groupIds[i], alloc.groupIds[j]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const maxEncounters =
    pairCounts.size > 0 ? Math.max(...pairCounts.values()) : 0;

  return { pairCounts, maxEncounters };
}

// ---------------------------------------------------------------------------
// Backward-compat shim: computeMatchupFairness
// ---------------------------------------------------------------------------
// Wordt nog gebruikt door plan-summary.ts en advisor code. Verwijderen in
// fase 3 wanneer die callers zijn gemigreerd. Tot dan: herberekend uit
// dezelfde pairCounts.

export function computeMatchupFairness(
  plan: PlanV2,
  _config: ConfigV2,
): { maxEncounters: number; fairness: number } {
  const { pairCounts, maxEncounters } = computeMatchupCounts(plan);
  if (pairCounts.size === 0) return { maxEncounters: 0, fairness: 1 };
  if (maxEncounters <= 1) return { maxEncounters, fairness: 1 };

  const counts = [...pairCounts.values()];
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance =
    counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0;

  return {
    maxEncounters,
    fairness: Math.max(0, Math.min(1, 1 - cv)),
  };
}

// ---------------------------------------------------------------------------
// Composite score — nieuw: modus-afhankelijke gewichten, scherpere
// normalisatie, matchupCeilingPenalty i.p.v. matchupFairness.
// Zie `docs/generator-design.md` §3.
// ---------------------------------------------------------------------------

/**
 * Compute the composite plan quality score. Higher `totalScore` = better plan.
 *
 * De scoring is modus-afhankelijk: in `all-spellen` modus wegen
 * spel-herhalingen zwaarder; in `round-robin` modus wegen
 * matchup-overschrijdingen zwaarder. De modus wordt gelezen uit
 * `config.scheduleSettings.scheduleMode`.
 *
 * `feasibility` is optioneel — als het niet wordt meegegeven, wordt het
 * intern berekend. Geef het mee als je het al hebt (performance).
 */
export function computePlanScore(
  plan: PlanV2,
  config: ConfigV2,
  feasibility?: FeasibilityReport,
  byeStationIds?: Set<Id>,
): PlanScoreBreakdown {
  const feas = feasibility ?? analyzePlanFeasibility(config);
  const mode = feas.mode;
  const w = mode === "all-spellen" ? WEIGHTS_ALL_SPELLEN : WEIGHTS_ROUND_ROBIN;

  // --- Sub-scores ---
  const stationOccupancy = computeStationOccupancy(plan, config, byeStationIds);
  const spelVariety = computeSpelVariety(plan, config);
  const repeatCount = computeRepeatCount(plan, config);
  const { pairCounts, maxEncounters: matchupMaxEncounters } = computeMatchupCounts(plan);

  // --- Spel repeat penalty ---
  // Normalisatie tegen wiskundig minimum: als de generator het minimum
  // bereikt, scoort hij 1.0 — ook als dat minimum > 0 is.
  const lowerBoundSpelRepeats = feas.totalLowerBoundSpelRepeats;
  const excessRepeats = Math.max(0, repeatCount - lowerBoundSpelRepeats);
  // maxUseful: worst-case realistisch scenario. Per groep kan het maximum
  // matchesPerGroup-1 herhalingen zijn (alles op dezelfde spel).
  const totalGroups = config.groups.length;
  const activeSlots = config.timeslots.filter((ts) => ts.kind === "active").length;
  const maxUseful = Math.max(1, totalGroups * Math.max(activeSlots - 1, 1));
  const spelRepeatPenalty = Math.max(0, 1 - excessRepeats / maxUseful);

  // --- Matchup ceiling penalty ---
  // Normalisatie tegen wiskundig plafond: elk paar dat vaker speelt dan
  // het plafond krijgt een strafpunt per extra keer.
  const maxLowerBoundMatchupCeiling = feas.segments.length > 0
    ? Math.max(...feas.segments.map((s) => s.lowerBoundMatchupCeiling))
    : 1;
  const lowerBoundMatchupCeiling = maxLowerBoundMatchupCeiling;
  let matchupExcess = 0;
  for (const count of pairCounts.values()) {
    matchupExcess += Math.max(0, count - lowerBoundMatchupCeiling);
  }
  const maxPairs = Math.max(1, pairCounts.size);
  const maxMatchupUseful = maxPairs * Math.max(activeSlots - 1, 1);
  const matchupCeilingPenalty = Math.max(
    0,
    1 - matchupExcess / Math.max(1, maxMatchupUseful)
  );

  // --- Gewogen totaal ---
  const totalScore =
    w.stationOccupancy * stationOccupancy +
    w.spelVariety * spelVariety +
    w.spelRepeatPenalty * spelRepeatPenalty +
    w.matchupCeilingPenalty * matchupCeilingPenalty;

  return {
    mode,
    stationOccupancy,
    spelVariety,
    repeatCount,
    lowerBoundSpelRepeats,
    spelRepeatPenalty,
    matchupMaxEncounters,
    lowerBoundMatchupCeiling,
    matchupCeilingPenalty,
    totalScore,
  };
}
