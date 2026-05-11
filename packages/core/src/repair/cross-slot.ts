/**
 * Cross-slot repair — ruilt station-toewijzingen tussen timeslots om
 * spel-herhalingen te verminderen.
 *
 * De bestaande `optimizePlanLocalIterative` kan alleen moves en swaps
 * *binnen* hetzelfde timeslot. Deze pass vult dat aan met swaps *tussen*
 * timeslots: als groep A op station X in ronde 3 een herhaling veroorzaakt
 * en er in ronde 5 een station Y beschikbaar is met een spel die groep A
 * nog niet heeft gespeeld, dan ruilen we de stationIds.
 *
 * Hill-climbing: per iteratie zoekt hij de swap met de grootste
 * repeat-reductie en past die toe. Stopt zodra geen verbetering meer
 * mogelijk is.
 *
 * Zie `docs/generator-fase-2-plan.md` stap 2.2.
 */

import type { ConfigV2, Id, PlanV2 } from "../model";
import type { FeasibilityReport } from "../feasibility";
import { computePlanScore } from "../scoring";
import { totalRepeatPenalty } from "../generator";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CrossSlotRepairOptions {
  feasibility: FeasibilityReport;
  maxIterations?: number;
}

export interface CrossSlotRepairResult {
  plan: PlanV2;
  appliedSwaps: Array<{
    timeslotIdA: Id;
    timeslotIdB: Id;
    stationIdA: Id;
    stationIdB: Id;
    repeatsBefore: number;
    repeatsAfter: number;
  }>;
  iterations: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function copyPlan(plan: PlanV2): PlanV2 {
  return {
    ...plan,
    allocations: plan.allocations.map((a) => ({ ...a })),
  };
}

function allocationSegmentId(
  config: ConfigV2,
  allocation: PlanV2["allocations"][number],
  groupSegmentById: Map<Id, Id | undefined>
): Id | null {
  if (!config.segmentsEnabled) return "__default__";
  if (allocation.groupIds.length === 0) return null;
  const first = groupSegmentById.get(allocation.groupIds[0]);
  if (!first) return null;
  for (const gid of allocation.groupIds) {
    if (groupSegmentById.get(gid) !== first) return null;
  }
  return first;
}

function allowedLocationIds(
  config: ConfigV2,
  segmentId: Id,
  timeslotId: Id
): Set<Id> {
  if (config.relaxedBlockTimeslotIds?.includes(timeslotId)) {
    return new Set(config.locations.map((l) => l.id));
  }
  if (config.movementPolicy === "free") {
    return new Set(config.locations.map((l) => l.id));
  }
  const blocks = config.locationBlocks ?? [];
  if (blocks.length === 0) {
    return new Set(config.locations.map((l) => l.id));
  }
  const block = blocks.find((b) => b.timeslotIds.includes(timeslotId));
  if (!block) return new Set();
  const loc = block.segmentLocationMap[segmentId];
  return loc ? new Set([loc]) : new Set();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function crossSlotRepair(
  config: ConfigV2,
  plan: PlanV2,
  options: CrossSlotRepairOptions
): CrossSlotRepairResult {
  const maxIterations = options.maxIterations ?? 100;
  const stationById = new Map(config.stations.map((s) => [s.id, s]));
  const groupSegmentById = new Map(
    config.groups.map((g) => [g.id, g.segmentId])
  );

  // Alleen actieve allocaties (niet pauze-stations)
  const isPauseStation = (stationId: Id) =>
    stationById.get(stationId)?.activityTypeId === "activity-pause";

  let working = copyPlan(plan);
  let currentRepeats = totalRepeatPenalty(working, config);
  const appliedSwaps: CrossSlotRepairResult["appliedSwaps"] = [];
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    if (currentRepeats === 0) break;
    iterations++;

    let bestDelta = 0;
    let bestI = -1;
    let bestJ = -1;

    const allocs = working.allocations;

    for (let i = 0; i < allocs.length; i++) {
      const a = allocs[i];
      if (isPauseStation(a.stationId)) continue;
      if (a.groupIds.length < 2) continue;
      const segA = allocationSegmentId(config, a, groupSegmentById);
      if (!segA) continue;

      for (let j = i + 1; j < allocs.length; j++) {
        const b = allocs[j];
        if (b.timeslotId === a.timeslotId) continue; // within-slot = existing optimizer
        if (isPauseStation(b.stationId)) continue;
        if (b.groupIds.length < 2) continue;
        if (a.stationId === b.stationId) continue; // noop

        const segB = allocationSegmentId(config, b, groupSegmentById);
        if (segB !== segA) continue; // different segment

        // Check block-policy: kan station A in timeslot B en vice versa?
        const stationA = stationById.get(a.stationId)!;
        const stationB = stationById.get(b.stationId)!;

        const allowedInTsB = allowedLocationIds(config, segA, b.timeslotId);
        const allowedInTsA = allowedLocationIds(config, segA, a.timeslotId);

        if (!allowedInTsB.has(stationA.locationId)) continue;
        if (!allowedInTsA.has(stationB.locationId)) continue;

        // Capacity check: capaciteit past bij het andere aantal groepen
        if (a.groupIds.length < stationB.capacityGroupsMin) continue;
        if (a.groupIds.length > stationB.capacityGroupsMax) continue;
        if (b.groupIds.length < stationA.capacityGroupsMin) continue;
        if (b.groupIds.length > stationA.capacityGroupsMax) continue;

        // Double-booking check: na swap mag station A's id niet al bezet
        // zijn in timeslot B, en station B's id niet in timeslot A.
        const stationAUsedInTsB = allocs.some(
          (x, xi) => xi !== i && xi !== j &&
            x.timeslotId === b.timeslotId && x.stationId === a.stationId
        );
        const stationBUsedInTsA = allocs.some(
          (x, xi) => xi !== i && xi !== j &&
            x.timeslotId === a.timeslotId && x.stationId === b.stationId
        );
        if (stationAUsedInTsB || stationBUsedInTsA) continue;

        // Probeer de swap
        const origStationA = a.stationId;
        const origStationB = b.stationId;
        a.stationId = origStationB;
        b.stationId = origStationA;

        const candidateRepeats = totalRepeatPenalty(working, config);
        const delta = currentRepeats - candidateRepeats; // positive = improvement

        if (delta > bestDelta) {
          bestDelta = delta;
          bestI = i;
          bestJ = j;
        }

        // Undo
        a.stationId = origStationA;
        b.stationId = origStationB;
      }
    }

    if (bestDelta <= 0) break; // geen verbetering mogelijk

    // Pas de beste swap toe
    const a = allocs[bestI];
    const b = allocs[bestJ];
    const oldA = a.stationId;
    const oldB = b.stationId;
    const repeatsBefore = currentRepeats;

    a.stationId = oldB;
    b.stationId = oldA;

    currentRepeats = totalRepeatPenalty(working, config);
    appliedSwaps.push({
      timeslotIdA: a.timeslotId,
      timeslotIdB: b.timeslotId,
      stationIdA: oldA,
      stationIdB: oldB,
      repeatsBefore,
      repeatsAfter: currentRepeats,
    });
  }

  return {
    plan: working,
    appliedSwaps,
    iterations,
  };
}
