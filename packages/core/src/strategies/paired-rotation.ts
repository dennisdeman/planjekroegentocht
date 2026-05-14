/**
 * Paired-rotation strategie — 100% speldekking voor even pools.
 *
 * Waar de algebraïsche constructie alleen werkt voor "nice-H" waarden
 * (H ∈ {3, 5, 7, 9, 11, ...}), dekt paired-rotation ALLE even pools
 * met G ≥ 6 en H = G/2. De strategie bouwt paren EN stationstoewijzingen
 * samen op via backtracking, zodat:
 *   - elke groep alle H stations bezoekt (0 spel-herhalingen)
 *   - elke tegenstander maximaal 1x wordt getroffen
 *   - maximaal 1 spelletje per station per ronde (stationscapaciteit)
 *
 * Trade-off: slechts 44-60% van de mogelijke paren wordt gebruikt
 * (partieel round-robin). In all-spellen modus is dat acceptabel.
 *
 * Brute-force bewezen voor: 6g/3s, 8g/4s, 10g/5s.
 * Alleen applicable als `algebraicFeasible` false is — algebraic levert
 * een compleet round-robin en is strikt beter wanneer dat werkt.
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
// Perfect matchings generator
// ---------------------------------------------------------------------------

/**
 * Genereert alle perfecte matchings van een array met even lengte.
 * Een perfecte matching is een set van n/2 disjuncte paren die alle
 * elementen dekken.
 */
function allPerfectMatchings<T>(items: T[]): Array<Array<[T, T]>> {
  if (items.length === 0) return [[]];
  if (items.length === 2) return [[[items[0], items[1]]]];

  const first = items[0];
  const rest = items.slice(1);
  const result: Array<Array<[T, T]>> = [];

  for (let i = 0; i < rest.length; i++) {
    const partner = rest[i];
    const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)];
    for (const sub of allPerfectMatchings(remaining)) {
      result.push([[first, partner], ...sub]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Backtracking solver: paren + stations samen
// ---------------------------------------------------------------------------

interface SolverResult {
  /** Per ronde: array van { pair, stationIndex } */
  rounds: Array<Array<{ pair: [Id, Id]; station: number }>>;
}

/**
 * Zoekt een schema van `roundCount` rondes waarin:
 * - elke groep alle stations (0..roundCount-1) bezoekt
 * - elke tegenstander max 1x voorkomt
 * - max 1 match per station per ronde
 *
 * Retourneert null als geen oplossing gevonden wordt binnen het budget.
 */
function solvePairedRotation(
  groupIds: Id[],
  roundCount: number,
  maxNodes: number,
): SolverResult | null {
  const G = groupIds.length;
  const H = G / 2; // = roundCount = stations

  const matchings = allPerfectMatchings(groupIds);

  // State
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
      // Alle rondes gepland — check of elke groep alle stations bezocht
      found = groupIds.every((g) => groupStations.get(g)!.size >= roundCount);
      return;
    }

    const remR = roundCount - ri;

    for (const matching of matchings) {
      if (found || nodes > maxNodes) return;

      // Check: geen herhaald paar
      let pairOk = true;
      for (const [a, b] of matching) {
        if (usedPairs.has(pairKey(a, b))) { pairOk = false; break; }
      }
      if (!pairOk) continue;

      // Forward check: elke groep moet nog genoeg rondes over hebben
      let fwdOk = true;
      for (const [a, b] of matching) {
        if (roundCount - groupStations.get(a)!.size > remR) { fwdOk = false; break; }
        if (roundCount - groupStations.get(b)!.size > remR) { fwdOk = false; break; }
      }
      if (!fwdOk) continue;

      // Probeer stationstoewijzingen via DFS per match
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
      // Alle matches in deze ronde toegewezen — ga naar volgende ronde
      // Pas state toe
      for (const { pair: [a, b] } of assignments) {
        usedPairs.add(pairKey(a, b));
      }
      schedule[ri] = [...assignments];

      // Forward check na toewijzing
      let ok = true;
      const remAfter = remR - 1;
      for (const g of groupIds) {
        if (roundCount - groupStations.get(g)!.size > remAfter) { ok = false; break; }
      }
      if (ok) searchRound(ri + 1);

      // Rollback
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

      // Apply
      usedInRound.add(s);
      groupStations.get(a)!.add(s);
      groupStations.get(b)!.add(s);
      assignments.push({ pair: [a, b], station: s });

      assignStations(ri, matching, mi + 1, usedInRound, assignments, remR);

      // Rollback
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

export const pairedRotationStrategy: PlanStrategy = {
  name: "paired-rotation",

  applicable(_config: ConfigV2, feasibility: FeasibilityReport): boolean {
    if (feasibility.segments.length === 0) return false;
    return feasibility.segments.every((seg) => seg.pairedRotationFeasible);
  },

  generate(config: ConfigV2): PlanAttempt | null {
    const activeTimeslots = [...config.timeslots]
      .filter((t) => t.kind === "active")
      .sort((a, b) => a.index - b.index);

    const bySegment = groupIdsBySegment(config);

    // Bouw stationsindex per locatie (zonder pause-stations)
    const stationsByLocation = new Map<Id, Id[]>();
    for (const station of config.stations) {
      if (station.activityTypeId === "activity-pause") continue;
      const list = stationsByLocation.get(station.locationId) ?? [];
      list.push(station.id);
      stationsByLocation.set(station.locationId, sortedIds(list));
    }

    const allocations: PlanV2["allocations"] = [];
    const byesByTimeslot: Record<Id, Id[]> = {};
    for (const ts of config.timeslots) byesByTimeslot[ts.id] = [];

    for (const segmentId of resolveSegmentIds(config)) {
      const groupIds = bySegment.get(segmentId) ?? [];
      if (groupIds.length < 6 || groupIds.length % 2 !== 0) return null;
      const H = groupIds.length / 2;

      for (const block of config.locationBlocks!) {
        const blockTimeslots = activeTimeslots.filter((t) =>
          block.timeslotIds.includes(t.id)
        );
        if (blockTimeslots.length === 0) continue;

        const locationId = block.segmentLocationMap[segmentId];
        if (!locationId) return null;
        const blockStationIds = stationsByLocation.get(locationId) ?? [];
        if (blockStationIds.length < H) return null;
        const usableStations = blockStationIds.slice(0, H);

        const roundCount = Math.min(blockTimeslots.length, H);

        // Solver: paren + stations samen via backtracking
        const result = solvePairedRotation(groupIds, roundCount, 500_000);
        if (!result) return null;

        // Bouw allocations
        for (let ri = 0; ri < roundCount; ri++) {
          const timeslot = blockTimeslots[ri];

          for (const entry of result.rounds[ri]) {
            const [g1, g2] = entry.pair;
            allocations.push({
              id: `alloc-pr-${allocations.length + 1}`,
              timeslotId: timeslot.id,
              stationId: usableStations[entry.station],
              groupIds: [g1, g2],
            });
          }
        }
      }
    }

    if (allocations.length === 0) return null;

    return {
      plan: {
        id: `plan-paired-rotation-${Date.now()}`,
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
