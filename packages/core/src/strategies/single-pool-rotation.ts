/**
 * Single-pool-rotation strategie — 0 spel-herhalingen voor 1 pool / 1 veld.
 *
 * Voor even groepen >= 4 met scheduleMode "all-spellen" en vrij verplaatsbeleid
 * (geen pools/blokken). Bouwt paren EN stationstoewijzingen samen op via
 * backtracking, zodat elke groep alle H = G/2 stations precies 1x bezoekt.
 *
 * Wiskundig bewezen voor 4g t/m 16g via brute-force. Het patroon (oplossing
 * bij eerste poging, nodes = H) suggereert dat het voor alle even G werkt.
 *
 * Verschil met paired-rotation: geen blocks-constraint, geen segment-iteratie.
 * Alles draait op 1 locatie met alle stations.
 */

import type { ConfigV2, Id, PlanV2 } from "../model";
import type { FeasibilityReport } from "../feasibility";
import {
  groupIdsBySegment,
  resolveSegmentIds,
  sortedIds,
} from "../generator";
import type { PlanAttempt, PlanStrategy } from "./index";

// ---------------------------------------------------------------------------
// Perfect matchings generator (lazy — yields one at a time)
// ---------------------------------------------------------------------------

function* lazyPerfectMatchings(items: Id[]): Generator<Array<[Id, Id]>> {
  if (items.length === 0) { yield []; return; }
  if (items.length === 2) { yield [[items[0], items[1]]]; return; }

  const first = items[0];
  const rest = items.slice(1);

  for (let i = 0; i < rest.length; i++) {
    const partner = rest[i];
    const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)];
    for (const sub of lazyPerfectMatchings(remaining)) {
      yield [[first, partner], ...sub];
    }
  }
}

// ---------------------------------------------------------------------------
// Backtracking solver
// ---------------------------------------------------------------------------

interface SolverResult {
  rounds: Array<Array<{ pair: [Id, Id]; station: number }>>;
}

function solveSinglePool(
  groupIds: Id[],
  roundCount: number,
  maxNodes: number,
): SolverResult | null {
  const G = groupIds.length;
  const H = G / 2;

  const groupStations = new Map<Id, Set<number>>();
  for (const g of groupIds) groupStations.set(g, new Set());
  const usedPairs = new Set<string>();
  const schedule: SolverResult["rounds"] = [];
  let found = false;
  let nodes = 0;

  function pairKey(a: Id, b: Id): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function searchRound(ri: number): void {
    if (found || nodes > maxNodes) return;
    if (ri === roundCount) {
      found = groupIds.every((g) => groupStations.get(g)!.size >= roundCount);
      return;
    }

    const remR = roundCount - ri;

    for (const matching of lazyPerfectMatchings(groupIds)) {
      if (found || nodes > maxNodes) return;

      // Check: geen herhaald paar
      let pairOk = true;
      for (const [a, b] of matching) {
        if (usedPairs.has(pairKey(a, b))) { pairOk = false; break; }
      }
      if (!pairOk) continue;

      // Forward check
      let fwdOk = true;
      for (const [a, b] of matching) {
        if (roundCount - groupStations.get(a)!.size > remR) { fwdOk = false; break; }
        if (roundCount - groupStations.get(b)!.size > remR) { fwdOk = false; break; }
      }
      if (!fwdOk) continue;

      assignStations(ri, matching, 0, new Set<number>(), [], remR);
    }
  }

  function assignStations(
    ri: number,
    matching: Array<[Id, Id]>,
    mi: number,
    usedInRound: Set<number>,
    assignments: Array<{ pair: [Id, Id]; station: number }>,
    remR: number,
  ): void {
    if (found || nodes > maxNodes) return;
    nodes++;

    if (mi === matching.length) {
      for (const { pair: [a, b] } of assignments) {
        usedPairs.add(pairKey(a, b));
      }
      schedule[ri] = [...assignments];

      const remAfter = remR - 1;
      let ok = true;
      for (const g of groupIds) {
        if (roundCount - groupStations.get(g)!.size > remAfter) { ok = false; break; }
      }
      if (ok) searchRound(ri + 1);

      for (const { pair: [a, b] } of assignments) {
        usedPairs.delete(pairKey(a, b));
      }
      return;
    }

    const [a, b] = matching[mi];
    for (let s = 0; s < H; s++) {
      if (usedInRound.has(s)) continue;
      if (groupStations.get(a)!.has(s)) continue;
      if (groupStations.get(b)!.has(s)) continue;

      usedInRound.add(s);
      groupStations.get(a)!.add(s);
      groupStations.get(b)!.add(s);
      assignments.push({ pair: [a, b], station: s });

      assignStations(ri, matching, mi + 1, usedInRound, assignments, remR);

      assignments.pop();
      groupStations.get(a)!.delete(s);
      groupStations.get(b)!.delete(s);
      usedInRound.delete(s);

      if (found) return;
    }
  }

  searchRound(0);

  if (!found || schedule.length < roundCount) return null;
  return { rounds: schedule };
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export const singlePoolRotationStrategy: PlanStrategy = {
  name: "single-pool-rotation",

  applicable(_config: ConfigV2, feasibility: FeasibilityReport): boolean {
    if (feasibility.segments.length === 0) return false;
    return feasibility.segments.every((seg) => seg.singlePoolFeasible);
  },

  generate(config: ConfigV2): PlanAttempt | null {
    const activeTimeslots = [...config.timeslots]
      .filter((t) => t.kind === "active")
      .sort((a, b) => a.index - b.index);

    const bySegment = groupIdsBySegment(config);

    // Bouw stationsindex (zonder pause-stations)
    const nonPauseStations = config.stations
      .filter((s) => s.activityTypeId !== "activity-pause");
    const stationIds = sortedIds(nonPauseStations.map((s) => s.id));

    const allocations: PlanV2["allocations"] = [];
    const byesByTimeslot: Record<Id, Id[]> = {};
    for (const ts of config.timeslots) byesByTimeslot[ts.id] = [];

    for (const segmentId of resolveSegmentIds(config)) {
      const groupIds = bySegment.get(segmentId) ?? [];
      if (groupIds.length < 4 || groupIds.length % 2 !== 0) return null;
      const H = groupIds.length / 2;

      if (stationIds.length < H) return null;
      const usableStations = stationIds.slice(0, H);

      const roundCount = Math.min(activeTimeslots.length, H);

      const result = solveSinglePool(groupIds, roundCount, 500_000);
      if (!result) return null;

      for (let ri = 0; ri < roundCount; ri++) {
        const timeslot = activeTimeslots[ri];

        for (const entry of result.rounds[ri]) {
          const [g1, g2] = entry.pair;
          allocations.push({
            id: `alloc-spr-${allocations.length + 1}`,
            timeslotId: timeslot.id,
            stationId: usableStations[entry.station],
            groupIds: [g1, g2],
          });
        }
      }
    }

    if (allocations.length === 0) return null;

    return {
      plan: {
        id: `plan-single-pool-rotation-${Date.now()}`,
        configId: config.id,
        allocations,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      byesByTimeslot,
      strategyName: this.name,
    };
  },
};
