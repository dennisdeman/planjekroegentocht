import type { ConfigV2, Id, PlanV2, RoundRobinRound } from "./model";
import { analyzePlanFeasibility, type FeasibilityReport } from "./feasibility";
import { crossSlotRepair } from "./repair/cross-slot";
import { computePlanScore, type PlanScoreBreakdown } from "./scoring";
import { STRATEGY_REGISTRY, type PlanAttempt } from "./strategies";
import { hasHardErrors, validatePlan } from "./validator";

export interface GenerateResultV2 {
  plan: PlanV2;
  byesByTimeslot: Record<Id, Id[]>;
  optimization?: {
    beforeScore: number;
    afterScore: number;
    iterations: number;
  };
  stationOptimization?: {
    before: number;
    after: number;
    changes: number;
    solvedZero: boolean;
    changedAllocations: StationReassignmentChange[];
  };
}

export interface RoundOrderShuffleOption {
  segmentId: Id;
  seed: number;
  withinBlockOnly?: boolean;
}

export interface GeneratePlanOptions {
  optimizer?: {
    maxIterations?: number;
    restarts?: number;
  };
  roundOrderShuffles?: RoundOrderShuffleOption[];
  assignment?: {
    mode?: "slot" | "blockExact";
    maxBlockSearchMs?: number;
    maxBlockNodes?: number;
  };
  /**
   * Beperk tot snelle strategieën (geen shuffled-rounds permutaties).
   * Bedoeld voor `proposeAlternatives` die tientallen configs evalueert
   * en niet per config 10+ seconden kan wachten.
   */
  fastStrategiesOnly?: boolean;
}

export class NoSolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoSolutionError";
  }
}

const MAX_ASSIGNMENT_SEARCH_SPACE = 200_000;

function isHardRepeatMode(config: ConfigV2): boolean {
  return config.constraints.avoidRepeatActivityType === "hard";
}

export function sortedIds(ids: Id[]): Id[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArrayDeterministic<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function blockActiveLengths(config: ConfigV2): number[] {
  if (config.movementPolicy !== "blocks" || !config.locationBlocks?.length) {
    return [];
  }
  const activeById = new Map(
    config.timeslots
      .filter((slot) => slot.kind === "active")
      .map((slot) => [slot.id, slot])
  );
  return [...config.locationBlocks]
    .map((block) => ({
      minIndex: Math.min(
        ...block.timeslotIds
          .map((slotId) => activeById.get(slotId)?.index)
          .filter((value): value is number => typeof value === "number")
      ),
      count: block.timeslotIds.filter((slotId) => activeById.has(slotId)).length,
    }))
    .filter((entry) => Number.isFinite(entry.minIndex) && entry.count > 0)
    .sort((a, b) => a.minIndex - b.minIndex)
    .map((entry) => entry.count);
}

function shuffleRoundsWithinBlocks(
  rounds: RoundRobinRound[],
  seed: number,
  blockLengths: number[]
): RoundRobinRound[] {
  if (blockLengths.length === 0) {
    return shuffleArrayDeterministic(rounds, seed);
  }
  const out: RoundRobinRound[] = [];
  let cursor = 0;
  for (let blockIndex = 0; blockIndex < blockLengths.length; blockIndex += 1) {
    const length = blockLengths[blockIndex];
    if (cursor >= rounds.length) {
      break;
    }
    const chunk = rounds.slice(cursor, cursor + length);
    out.push(...shuffleArrayDeterministic(chunk, seed + blockIndex));
    cursor += length;
  }
  if (cursor < rounds.length) {
    out.push(...rounds.slice(cursor));
  }
  return out;
}

export function applyRoundOrderShuffles(
  config: ConfigV2,
  roundsBySegment: Map<Id, RoundRobinRound[]>,
  options: GeneratePlanOptions
): Map<Id, RoundRobinRound[]> {
  const shuffles = options.roundOrderShuffles ?? [];
  if (shuffles.length === 0) {
    return roundsBySegment;
  }
  const next = new Map<Id, RoundRobinRound[]>();
  const blockLengths = blockActiveLengths(config);
  for (const [segmentId, rounds] of roundsBySegment.entries()) {
    const directives = shuffles
      .filter((entry) => entry.segmentId === segmentId)
      .sort((a, b) => a.seed - b.seed);
    let current = [...rounds];
    for (const directive of directives) {
      current = directive.withinBlockOnly
        ? shuffleRoundsWithinBlocks(current, directive.seed, blockLengths)
        : shuffleArrayDeterministic(current, directive.seed);
    }
    next.set(segmentId, current);
  }
  return next;
}

function rotateCircle<T>(items: T[]): T[] {
  if (items.length <= 2) {
    return [...items];
  }
  const [fixed, ...rest] = items;
  const last = rest.pop();
  if (last === undefined) {
    return [...items];
  }
  return [fixed, last, ...rest];
}

export function generateRoundRobin(groupIdsInput: Id[], roundsNeeded?: number): RoundRobinRound[] {
  const groupIds = sortedIds(groupIdsInput);
  if (groupIds.length < 2) {
    return [];
  }

  const ghost = "__BYE__";
  const circle = [...groupIds];
  const odd = circle.length % 2 === 1;
  if (odd) {
    circle.push(ghost);
  }

  function generateOneRound(state: Id[]): RoundRobinRound {
    const matches: Array<[Id, Id]> = [];
    let bye: Id | undefined;
    for (let i = 0; i < state.length / 2; i += 1) {
      const a = state[i];
      const b = state[state.length - 1 - i];
      if (a === ghost && b !== ghost) { bye = b; continue; }
      if (b === ghost && a !== ghost) { bye = a; continue; }
      if (a !== ghost && b !== ghost) {
        matches.push(a < b ? [a, b] : [b, a]);
      }
    }
    return {
      matches: matches.sort(([a1, b1], [a2, b2]) => `${a1}-${b1}`.localeCompare(`${a2}-${b2}`)),
      bye,
    };
  }

  const rounds: RoundRobinRound[] = [];
  const baseRoundCount = circle.length - 1;
  let state = [...circle];

  for (let roundIndex = 0; roundIndex < baseRoundCount; roundIndex += 1) {
    rounds.push(generateOneRound(state));
    state = rotateCircle(state);
  }

  // Generate extra rounds when roundsNeeded > base round-robin rounds.
  // Uses a different fixed element to produce rounds with different match COMBINATIONS per round,
  // giving the station assignment algorithm better spel variety across blocks.
  if (roundsNeeded && roundsNeeded > rounds.length) {
    const extraNeeded = roundsNeeded - rounds.length;
    // Use a different fixed element (2nd group instead of 1st) for the circle method.
    // This creates rounds where the same matchups appear, but grouped differently per round,
    // so the station assignment has more flexibility.
    const extraCircle = [circle[1], circle[0], ...circle.slice(2)];
    if (odd) extraCircle[extraCircle.length - 1] = ghost;
    let extraState = [...extraCircle];
    for (let i = 0; i < extraNeeded; i++) {
      rounds.push(generateOneRound(extraState));
      extraState = rotateCircle(extraState);
    }
  }

  return rounds;
}

export function resolveSegmentIds(config: ConfigV2): Id[] {
  if (config.segmentsEnabled) {
    return sortedIds(config.segments.map((segment) => segment.id));
  }
  return ["__default__"];
}

export function groupIdsBySegment(config: ConfigV2): Map<Id, Id[]> {
  const map = new Map<Id, Id[]>();
  const segments = resolveSegmentIds(config);
  for (const segmentId of segments) {
    map.set(segmentId, []);
  }
  for (const group of config.groups) {
    const segmentId =
      config.segmentsEnabled ? group.segmentId ?? "__missing__" : "__default__";
    const list = map.get(segmentId) ?? [];
    list.push(group.id);
    map.set(segmentId, list);
  }
  for (const [segmentId, list] of map.entries()) {
    map.set(segmentId, sortedIds(list));
  }
  return map;
}

function locationForSegmentTimeslot(config: ConfigV2, segmentId: Id, timeslotId: Id): Id[] {
  if (config.relaxedBlockTimeslotIds?.includes(timeslotId)) {
    return sortedIds(config.locations.map((location) => location.id));
  }
  if (config.movementPolicy === "free") {
    return sortedIds(config.locations.map((location) => location.id));
  }
  const block = (config.locationBlocks ?? []).find((entry) =>
    entry.timeslotIds.includes(timeslotId)
  );
  if (!block) {
    throw new Error(
      `No location block found for timeslot ${timeslotId} while movementPolicy=blocks.`
    );
  }
  const locationId = block.segmentLocationMap[segmentId];
  if (!locationId) {
    throw new Error(
      `No segment->location mapping for segment ${segmentId} in block ${block.id}.`
    );
  }
  return [locationId];
}

function activityRepeatScore(
  repeatCounter: Map<Id, Map<Id, number>>,
  groupA: Id,
  groupB: Id,
  activityTypeId: Id
): number {
  const mapA = repeatCounter.get(groupA) ?? new Map<Id, number>();
  const mapB = repeatCounter.get(groupB) ?? new Map<Id, number>();
  return (mapA.get(activityTypeId) ?? 0) + (mapB.get(activityTypeId) ?? 0);
}

function incrementActivityRepeat(
  repeatCounter: Map<Id, Map<Id, number>>,
  groupId: Id,
  activityTypeId: Id
): void {
  const groupMap = repeatCounter.get(groupId) ?? new Map<Id, number>();
  groupMap.set(activityTypeId, (groupMap.get(activityTypeId) ?? 0) + 1);
  repeatCounter.set(groupId, groupMap);
}

function activitySeenBefore(
  repeatCounter: Map<Id, Map<Id, number>>,
  groupId: Id,
  activityTypeId: Id
): boolean {
  return (repeatCounter.get(groupId)?.get(activityTypeId) ?? 0) > 0;
}

function allocationSegmentId(
  config: ConfigV2,
  allocation: PlanV2["allocations"][number],
  groupSegmentById: Map<Id, Id | undefined>
): Id | null {
  if (!config.segmentsEnabled) {
    return "__default__";
  }
  if (allocation.groupIds.length === 0) {
    return null;
  }
  const firstSegment = groupSegmentById.get(allocation.groupIds[0]);
  if (!firstSegment) {
    return null;
  }
  for (const groupId of allocation.groupIds) {
    if (groupSegmentById.get(groupId) !== firstSegment) {
      return null;
    }
  }
  return firstSegment;
}

function copyPlan(plan: PlanV2): PlanV2 {
  return {
    ...plan,
    allocations: plan.allocations.map((allocation) => ({ ...allocation })),
  };
}

function withMovedStation(plan: PlanV2, allocationId: Id, stationId: Id): PlanV2 {
  return {
    ...plan,
    allocations: plan.allocations.map((allocation) =>
      allocation.id === allocationId ? { ...allocation, stationId } : allocation
    ),
  };
}

function withSwappedStations(plan: PlanV2, allocationAId: Id, allocationBId: Id): PlanV2 {
  const allocationA = plan.allocations.find((allocation) => allocation.id === allocationAId);
  const allocationB = plan.allocations.find((allocation) => allocation.id === allocationBId);
  if (!allocationA || !allocationB) {
    return plan;
  }
  return {
    ...plan,
    allocations: plan.allocations.map((allocation) => {
      if (allocation.id === allocationAId) {
        return { ...allocation, stationId: allocationB.stationId };
      }
      if (allocation.id === allocationBId) {
        return { ...allocation, stationId: allocationA.stationId };
      }
      return allocation;
    }),
  };
}

export function totalRepeatPenalty(plan: PlanV2, config: ConfigV2): number {
  const stationById = new Map(config.stations.map((station) => [station.id, station]));
  const countsByGroup = new Map<Id, Map<Id, number>>();

  for (const allocation of plan.allocations) {
    const station = stationById.get(allocation.stationId);
    if (!station) {
      continue;
    }
    for (const groupId of allocation.groupIds) {
      const byType = countsByGroup.get(groupId) ?? new Map<Id, number>();
      byType.set(station.activityTypeId, (byType.get(station.activityTypeId) ?? 0) + 1);
      countsByGroup.set(groupId, byType);
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

interface MatchStationAssignment {
  match: [Id, Id];
  stationId: Id;
}

function permutationCount(n: number, k: number, cap = Number.MAX_SAFE_INTEGER): number {
  if (k > n) {
    return 0;
  }
  let total = 1;
  for (let i = 0; i < k; i += 1) {
    total *= n - i;
    if (total > cap) {
      return cap;
    }
  }
  return total;
}

function chooseGreedyAssignments(
  matches: Array<[Id, Id]>,
  candidateStationIds: Id[],
  stationsById: Map<Id, ConfigV2["stations"][number]>,
  repeatCounter: Map<Id, Map<Id, number>>,
  timeslotId: Id,
  hardRepeatConstraint: boolean
): MatchStationAssignment[] {
  const remaining = [...candidateStationIds];
  const assignments: MatchStationAssignment[] = [];

  for (const [g1, g2] of matches) {
    const scored = remaining
      .map((stationId) => {
        const station = stationsById.get(stationId);
        if (!station) {
          return null;
        }
        return {
          stationId,
          score: activityRepeatScore(repeatCounter, g1, g2, station.activityTypeId),
        };
      })
      .filter((value) => {
        if (!hardRepeatConstraint || !value) {
          return Boolean(value);
        }
        const station = stationsById.get(value.stationId);
        if (!station) {
          return false;
        }
        return (
          !activitySeenBefore(repeatCounter, g1, station.activityTypeId) &&
          !activitySeenBefore(repeatCounter, g2, station.activityTypeId)
        );
      })
      .filter((value): value is { stationId: Id; score: number } => Boolean(value))
      .sort((a, b) =>
        a.score === b.score ? a.stationId.localeCompare(b.stationId) : a.score - b.score
      );

    const selected = scored[0];
    if (!selected) {
      throw new NoSolutionError(
        `No station candidate left for match ${g1} vs ${g2} in timeslot ${timeslotId}.`
      );
    }
    assignments.push({ match: [g1, g2], stationId: selected.stationId });
    const idx = remaining.indexOf(selected.stationId);
    if (idx >= 0) {
      remaining.splice(idx, 1);
    }
  }

  return assignments;
}

function compareAssignmentOrder(a: Id[], b: Id[] | null): number {
  if (!b) {
    return -1;
  }
  for (let i = 0; i < a.length; i += 1) {
    const compare = a[i].localeCompare(b[i] ?? "");
    if (compare !== 0) {
      return compare;
    }
  }
  return 0;
}

function chooseOptimalAssignments(
  matches: Array<[Id, Id]>,
  candidateStationIds: Id[],
  stationsById: Map<Id, ConfigV2["stations"][number]>,
  repeatCounter: Map<Id, Map<Id, number>>,
  hardRepeatConstraint: boolean
): MatchStationAssignment[] {
  const orderedMatches = [...matches].sort(([a1, b1], [a2, b2]) =>
    `${a1}-${b1}`.localeCompare(`${a2}-${b2}`)
  );
  const orderedStations = [...candidateStationIds].sort((a, b) => a.localeCompare(b));

  let bestScore = Number.POSITIVE_INFINITY;
  let bestStationOrder: Id[] | null = null;

  const usedStations = new Set<Id>();
  const currentOrder: Id[] = new Array(orderedMatches.length);

  const walk = (index: number, score: number): void => {
    if (score > bestScore) {
      return;
    }
    if (index >= orderedMatches.length) {
      const order = [...currentOrder];
      if (score < bestScore || (score === bestScore && compareAssignmentOrder(order, bestStationOrder) < 0)) {
        bestScore = score;
        bestStationOrder = order;
      }
      return;
    }

    const [g1, g2] = orderedMatches[index];
    for (const stationId of orderedStations) {
      if (usedStations.has(stationId)) {
        continue;
      }
      const station = stationsById.get(stationId);
      if (!station) {
        continue;
      }
      if (
        hardRepeatConstraint &&
        (activitySeenBefore(repeatCounter, g1, station.activityTypeId) ||
          activitySeenBefore(repeatCounter, g2, station.activityTypeId))
      ) {
        continue;
      }
      const stepCost = activityRepeatScore(repeatCounter, g1, g2, station.activityTypeId);
      usedStations.add(stationId);
      currentOrder[index] = stationId;
      walk(index + 1, score + stepCost);
      usedStations.delete(stationId);
    }
  };

  walk(0, 0);

  if (!bestStationOrder) {
    return [];
  }
  const finalStationOrder = bestStationOrder;

  return orderedMatches.map((match, index) => ({
    match,
    stationId: finalStationOrder[index],
  }));
}

function chooseStationAssignments(
  matches: Array<[Id, Id]>,
  candidateStationIds: Id[],
  stationsById: Map<Id, ConfigV2["stations"][number]>,
  repeatCounter: Map<Id, Map<Id, number>>,
  timeslotId: Id,
  hardRepeatConstraint: boolean
): MatchStationAssignment[] {
  const searchSpace = permutationCount(
    candidateStationIds.length,
    matches.length,
    MAX_ASSIGNMENT_SEARCH_SPACE + 1
  );
  if (searchSpace > MAX_ASSIGNMENT_SEARCH_SPACE) {
    return chooseGreedyAssignments(
      matches,
      candidateStationIds,
      stationsById,
      repeatCounter,
      timeslotId,
      hardRepeatConstraint
    );
  }
  const optimal = chooseOptimalAssignments(
    matches,
    candidateStationIds,
    stationsById,
    repeatCounter,
    hardRepeatConstraint
  );
  if (optimal.length === matches.length) {
    return optimal;
  }
  return chooseGreedyAssignments(
    matches,
    candidateStationIds,
    stationsById,
    repeatCounter,
    timeslotId,
    hardRepeatConstraint
  );
}

export interface AssignToStationsOptions {
  mode?: "slot" | "blockExact";
  maxBlockSearchMs?: number;
  maxBlockNodes?: number;
}

interface RoundAssignmentOption {
  assignments: MatchStationAssignment[];
  stationOrderKey: string;
}

interface BlockRoundContext {
  timeslotId: Id;
  timeslotIndex: number;
  round: RoundRobinRound;
  candidateStationIds: Id[];
  allowedLocationKey: string;
  options: RoundAssignmentOption[];
}

function getActivityCount(
  repeatCounter: Map<Id, Map<Id, number>>,
  groupId: Id,
  activityTypeId: Id
): number {
  return repeatCounter.get(groupId)?.get(activityTypeId) ?? 0;
}

function cloneRepeatCounter(
  repeatCounter: Map<Id, Map<Id, number>>
): Map<Id, Map<Id, number>> {
  const next = new Map<Id, Map<Id, number>>();
  for (const [groupId, byActivity] of repeatCounter.entries()) {
    next.set(groupId, new Map(byActivity));
  }
  return next;
}

function applyAssignmentOption(
  repeatCounter: Map<Id, Map<Id, number>>,
  option: RoundAssignmentOption,
  stationsById: Map<Id, ConfigV2["stations"][number]>
): Array<{ groupId: Id; activityTypeId: Id; previous: number }> {
  const changes: Array<{ groupId: Id; activityTypeId: Id; previous: number }> = [];
  for (const assignment of option.assignments) {
    const station = stationsById.get(assignment.stationId);
    if (!station) {
      continue;
    }
    for (const groupId of assignment.match) {
      const map = repeatCounter.get(groupId) ?? new Map<Id, number>();
      const previous = map.get(station.activityTypeId) ?? 0;
      map.set(station.activityTypeId, previous + 1);
      repeatCounter.set(groupId, map);
      changes.push({ groupId, activityTypeId: station.activityTypeId, previous });
    }
  }
  return changes;
}

function undoAssignmentOption(
  repeatCounter: Map<Id, Map<Id, number>>,
  changes: Array<{ groupId: Id; activityTypeId: Id; previous: number }>
): void {
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const change = changes[i];
    const map = repeatCounter.get(change.groupId);
    if (!map) {
      continue;
    }
    if (change.previous <= 0) {
      map.delete(change.activityTypeId);
      if (map.size === 0) {
        repeatCounter.delete(change.groupId);
      }
      continue;
    }
    map.set(change.activityTypeId, change.previous);
  }
}

function evaluateAssignmentOption(
  option: RoundAssignmentOption,
  repeatCounter: Map<Id, Map<Id, number>>,
  stationsById: Map<Id, ConfigV2["stations"][number]>,
  hardRepeatConstraint: boolean
): { valid: boolean; cost: number } {
  let cost = 0;
  for (const assignment of option.assignments) {
    const station = stationsById.get(assignment.stationId);
    if (!station) {
      return { valid: false, cost: Number.POSITIVE_INFINITY };
    }
    const [g1, g2] = assignment.match;
    const score1 = getActivityCount(repeatCounter, g1, station.activityTypeId);
    const score2 = getActivityCount(repeatCounter, g2, station.activityTypeId);
    if (hardRepeatConstraint && (score1 > 0 || score2 > 0)) {
      return { valid: false, cost: Number.POSITIVE_INFINITY };
    }
    cost += score1 + score2;
  }
  return { valid: true, cost };
}

function enumerateRoundAssignmentOptions(
  matches: Array<[Id, Id]>,
  candidateStationIds: Id[],
  stationsById: Map<Id, ConfigV2["stations"][number]>
): RoundAssignmentOption[] {
  const orderedMatches = [...matches].sort(([a1, b1], [a2, b2]) =>
    `${a1}-${b1}`.localeCompare(`${a2}-${b2}`)
  );
  const orderedStations = [...candidateStationIds].sort((a, b) => a.localeCompare(b));
  const used = new Set<Id>();
  const stationOrder: Id[] = new Array(orderedMatches.length);
  const out: RoundAssignmentOption[] = [];

  const walk = (index: number): void => {
    if (index >= orderedMatches.length) {
      const assignments = orderedMatches.map((match, matchIndex) => ({
        match,
        stationId: stationOrder[matchIndex],
      }));
      out.push({
        assignments,
        stationOrderKey: stationOrder.join("|"),
      });
      return;
    }

    for (const stationId of orderedStations) {
      if (used.has(stationId)) {
        continue;
      }
      const station = stationsById.get(stationId);
      if (!station) {
        continue;
      }
      const groupCount = orderedMatches[index].length;
      if (
        groupCount < station.capacityGroupsMin ||
        groupCount > station.capacityGroupsMax
      ) {
        continue;
      }
      used.add(stationId);
      stationOrder[index] = stationId;
      walk(index + 1);
      used.delete(stationId);
    }
  };

  walk(0);
  return out.sort((a, b) => a.stationOrderKey.localeCompare(b.stationOrderKey));
}

export function perMatchSearch(
  matches: Array<Array<[Id, Id]>>,
  stationCount: number,
  initialVisits: Map<Id, Set<number>>,
  roundCount: number,
  maxNodes = 500_000,
): { cost: number; assignment: number[][] | null } {
  let bestCost = Number.POSITIVE_INFINITY;
  let bestAssignment: number[][] | null = null;
  let nodesVisited = 0;
  const current: number[][] = Array.from({ length: roundCount }, () => []);

  // Clone visits so we can mutate and undo
  const visits = new Map<Id, Set<number>>();
  for (const [k, v] of initialVisits) visits.set(k, new Set(v));

  function search(ri: number, mi: number, cost: number): void {
    if (cost >= bestCost) return;
    if (++nodesVisited > maxNodes) return;
    if (ri >= roundCount) {
      bestCost = cost;
      bestAssignment = current.map((r) => [...r]);
      return;
    }
    if (mi >= matches[ri].length) {
      search(ri + 1, 0, cost);
      return;
    }

    const [g1, g2] = matches[ri][mi];
    const usedInRound = new Set(current[ri]);

    for (let s = 0; s < stationCount; s++) {
      if (usedInRound.has(s)) continue;
      const r1 = visits.get(g1)?.has(s) ? 1 : 0;
      const r2 = visits.get(g2)?.has(s) ? 1 : 0;
      if (cost + r1 + r2 >= bestCost) continue;

      current[ri].push(s);
      if (!visits.has(g1)) visits.set(g1, new Set());
      if (!visits.has(g2)) visits.set(g2, new Set());
      const had1 = visits.get(g1)!.has(s);
      const had2 = visits.get(g2)!.has(s);
      visits.get(g1)!.add(s);
      visits.get(g2)!.add(s);

      search(ri, mi + 1, cost + r1 + r2);

      current[ri].pop();
      if (!had1) visits.get(g1)!.delete(s);
      if (!had2) visits.get(g2)!.delete(s);

      if (bestCost === 0) return;
      if (nodesVisited > maxNodes) return;
    }
  }

  search(0, 0, 0);
  return { cost: bestCost, assignment: bestAssignment };
}

function chooseBlockExactAssignments(
  entries: BlockRoundContext[],
  repeatCounter: Map<Id, Map<Id, number>>,
  stationsById: Map<Id, ConfigV2["stations"][number]>,
  hardRepeatConstraint: boolean,
  maxBlockSearchMs: number,
  maxBlockNodes: number
): RoundAssignmentOption[] {
  const startedAt = Date.now();
  let nodesVisited = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestKeys: string[] | null = null;
  let bestChoice: RoundAssignmentOption[] | null = null;
  const currentKeys: string[] = new Array(entries.length);
  const currentChoice: RoundAssignmentOption[] = new Array(entries.length);

  // Per-match DFS seed: kies station per match (niet per ronde) met agressieve pruning.
  // Vindt 0-herhaling oplossingen in ~100 nodes waar de per-ronde DFS 40.000+ nodig heeft.
  // maxNodes budget voorkomt timeout bij grote blokken.
  if (entries.length > 1) {
    const pmStations = entries[0].candidateStationIds;
    const pmMatches = entries.map((e) =>
      [...e.round.matches].sort(([a1, b1], [a2, b2]) => `${a1}-${b1}`.localeCompare(`${a2}-${b2}`))
    );
    const pmH = pmStations.length;
    const pmVisits = new Map<Id, Set<number>>();
    for (const [groupId, byType] of repeatCounter) {
      const visited = new Set<number>();
      for (const [actTypeId, count] of byType) {
        if (count > 0) {
          const stIdx = pmStations.findIndex((sid) => stationsById.get(sid)?.activityTypeId === actTypeId);
          if (stIdx >= 0) visited.add(stIdx);
        }
      }
      pmVisits.set(groupId, visited);
    }

    const pmResult = perMatchSearch(pmMatches, pmH, pmVisits, entries.length);

    if (pmResult.assignment && pmResult.cost < bestCost) {
      const pmAssignment = pmResult.assignment;
      const seedChoice: RoundAssignmentOption[] = [];
      for (let ri = 0; ri < entries.length; ri++) {
        const stationOrder = pmAssignment[ri].map((si: number) => pmStations[si]);
        const key = stationOrder.join("|");
        const option = entries[ri].options.find((o) => o.stationOrderKey === key);
        if (option) {
          seedChoice.push(option);
        } else {
          const assignments = pmMatches[ri].map((match, mi) => ({
            match: match as [Id, Id],
            stationId: pmStations[pmAssignment[ri][mi]],
          }));
          seedChoice.push({ assignments, stationOrderKey: key });
        }
      }
      bestCost = pmResult.cost;
      bestChoice = seedChoice;
      bestKeys = seedChoice.map((o) => o.stationOrderKey);
    }
  }

  const compareKeys = (left: string[], right: string[] | null): number => {
    if (!right) {
      return -1;
    }
    for (let i = 0; i < left.length; i += 1) {
      const cmp = left[i].localeCompare(right[i] ?? "");
      if (cmp !== 0) {
        return cmp;
      }
    }
    return 0;
  };

  const fallbackBySlot = (): RoundAssignmentOption[] =>
    {
      const tempCounter = cloneRepeatCounter(repeatCounter);
      const selected: RoundAssignmentOption[] = [];
      for (const entry of entries) {
      const chosen = chooseStationAssignments(
        entry.round.matches,
        entry.candidateStationIds,
        stationsById,
        tempCounter,
        entry.timeslotId,
        hardRepeatConstraint
      );
      if (chosen.length !== entry.round.matches.length) {
        throw new NoSolutionError(
          `No solution: cannot assign stations in exact-block fallback for slot ${entry.timeslotId}.`
        );
      }
      selected.push({
        assignments: chosen,
        stationOrderKey: chosen.map((assignment) => assignment.stationId).join("|"),
      });
      for (const assignment of chosen) {
        const [g1, g2] = assignment.match;
        const station = stationsById.get(assignment.stationId);
        if (!station) {
          continue;
        }
        incrementActivityRepeat(tempCounter, g1, station.activityTypeId);
        incrementActivityRepeat(tempCounter, g2, station.activityTypeId);
      }
    }
    return selected;
  };

  // Skip de DFS walk als de per-match seed al een resultaat heeft gevonden.
  // De per-match DFS is exhaustief en vindt altijd het optimum — de per-ronde DFS
  // kan niet beter en kost alleen maar extra tijd.
  if (bestChoice) {
    return bestChoice;
  }

  const walk = (depth: number, score: number): void => {
    if (bestCost === 0) return;
    if (Date.now() - startedAt > maxBlockSearchMs || nodesVisited > maxBlockNodes) {
      return;
    }
    nodesVisited += 1;
    if (score > bestCost) {
      return;
    }
    if (depth >= entries.length) {
      if (score < bestCost || (score === bestCost && compareKeys(currentKeys, bestKeys) < 0)) {
        bestCost = score;
        bestKeys = [...currentKeys];
        bestChoice = [...currentChoice];
      }
      return;
    }

    const entry = entries[depth];
    const scored = entry.options
      .map((option) => {
        const evaluation = evaluateAssignmentOption(
          option,
          repeatCounter,
          stationsById,
          hardRepeatConstraint
        );
        return {
          option,
          valid: evaluation.valid,
          stepCost: evaluation.cost,
        };
      })
      .filter((option) => option.valid)
      .sort((a, b) =>
        a.stepCost === b.stepCost
          ? a.option.stationOrderKey.localeCompare(b.option.stationOrderKey)
          : a.stepCost - b.stepCost
      );

    for (const candidate of scored) {
      if (score + candidate.stepCost > bestCost) {
        continue;
      }
      const changes = applyAssignmentOption(repeatCounter, candidate.option, stationsById);
      currentChoice[depth] = candidate.option;
      currentKeys[depth] = candidate.option.stationOrderKey;
      walk(depth + 1, score + candidate.stepCost);
      undoAssignmentOption(repeatCounter, changes);
    }
  };

  walk(0, 0);
  if (!bestChoice) {
    return fallbackBySlot();
  }
  return bestChoice;
}

function assignToStationsBySlot(
  config: ConfigV2,
  roundsBySegment: Map<Id, RoundRobinRound[]>
): GenerateResultV2 {
  const hardRepeatConstraint = isHardRepeatMode(config);
  const timeslots = [...config.timeslots].sort((a, b) => a.index - b.index);
  const activeTimeslots = timeslots.filter((timeslot) => timeslot.kind === "active");
  const stationsById = new Map(config.stations.map((station) => [station.id, station]));
  const stationsByLocation = new Map<Id, Id[]>();
  for (const station of config.stations) {
    const list = stationsByLocation.get(station.locationId) ?? [];
    list.push(station.id);
    stationsByLocation.set(station.locationId, sortedIds(list));
  }

  const usedStationsByTimeslot = new Map<Id, Set<Id>>();
  for (const timeslot of timeslots) {
    usedStationsByTimeslot.set(timeslot.id, new Set());
  }

  const allocations: PlanV2["allocations"] = [];
  const byesByTimeslot: Record<Id, Id[]> = {};
  const segments = resolveSegmentIds(config);
  for (const timeslot of timeslots) {
    byesByTimeslot[timeslot.id] = [];
  }

  for (const segmentId of segments) {
    const rounds = roundsBySegment.get(segmentId) ?? [];
    const repeatCounter = new Map<Id, Map<Id, number>>();

    for (
      let roundIndex = 0;
      roundIndex < rounds.length && roundIndex < activeTimeslots.length;
      roundIndex += 1
    ) {
      const round = rounds[roundIndex];
      const timeslot = activeTimeslots[roundIndex];
      if (round.bye) {
        byesByTimeslot[timeslot.id].push(round.bye);
        // Allocate bye group to pause station if configured
        if (config.pauseActivity) {
          const allowedLocs = locationForSegmentTimeslot(config, segmentId, timeslot.id);
          const pauseStation = config.stations.find(
            (s) => s.activityTypeId === "activity-pause" && allowedLocs.includes(s.locationId)
              && !usedStationsByTimeslot.get(timeslot.id)?.has(s.id)
          );
          if (pauseStation) {
            allocations.push({
              id: `alloc-${timeslot.id}-${pauseStation.id}-${segmentId}`,
              timeslotId: timeslot.id,
              stationId: pauseStation.id,
              groupIds: [round.bye],
            });
            usedStationsByTimeslot.get(timeslot.id)?.add(pauseStation.id);
          }
        }
      }

      const allowedLocations = locationForSegmentTimeslot(config, segmentId, timeslot.id);
      const candidateStationIds = allowedLocations
        .flatMap((locationId) => stationsByLocation.get(locationId) ?? [])
        .filter((stationId) => !usedStationsByTimeslot.get(timeslot.id)?.has(stationId))
        .filter((stationId) => stationsById.get(stationId)?.activityTypeId !== "activity-pause")
        .sort((a, b) => a.localeCompare(b));

      if (candidateStationIds.length < round.matches.length) {
        throw new NoSolutionError(
          `No solution: timeslot ${timeslot.id}, segment ${segmentId} has ${round.matches.length} matches and ${candidateStationIds.length} stations.`
        );
      }

      const assignments = chooseStationAssignments(
        round.matches,
        candidateStationIds,
        stationsById,
        repeatCounter,
        timeslot.id,
        hardRepeatConstraint
      );
      if (assignments.length !== round.matches.length) {
        throw new NoSolutionError(
          `No solution: cannot assign stations for segment ${segmentId} in timeslot ${timeslot.id} without violating constraints.`
        );
      }

      for (const assignment of assignments) {
        const [g1, g2] = assignment.match;
        const station = stationsById.get(assignment.stationId);
        if (!station) {
          throw new NoSolutionError(`Unknown station ${assignment.stationId}.`);
        }
        allocations.push({
          id: `alloc-${timeslot.id}-${assignment.stationId}-${segmentId}-${g1}-${g2}`,
          timeslotId: timeslot.id,
          stationId: assignment.stationId,
          groupIds: [g1, g2],
        });
        usedStationsByTimeslot.get(timeslot.id)?.add(assignment.stationId);

        incrementActivityRepeat(repeatCounter, g1, station.activityTypeId);
        incrementActivityRepeat(repeatCounter, g2, station.activityTypeId);
      }
    }
  }

  const plan: PlanV2 = {
    id: `plan-${config.id}`,
    configId: config.id,
    allocations,
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  return { plan, byesByTimeslot };
}

function assignToStationsByExactBlocks(
  config: ConfigV2,
  roundsBySegment: Map<Id, RoundRobinRound[]>,
  options: AssignToStationsOptions
): GenerateResultV2 {
  const hardRepeatConstraint = isHardRepeatMode(config);
  const timeslots = [...config.timeslots].sort((a, b) => a.index - b.index);
  const activeTimeslots = timeslots.filter((timeslot) => timeslot.kind === "active");
  const stationsById = new Map(config.stations.map((station) => [station.id, station]));
  const stationsByLocation = new Map<Id, Id[]>();
  for (const station of config.stations) {
    const list = stationsByLocation.get(station.locationId) ?? [];
    list.push(station.id);
    stationsByLocation.set(station.locationId, sortedIds(list));
  }
  const maxBlockSearchMs = Math.max(10, options.maxBlockSearchMs ?? 80);
  const maxBlockNodes = Math.max(500, options.maxBlockNodes ?? 40_000);

  const usedStationsByTimeslot = new Map<Id, Set<Id>>();
  for (const timeslot of timeslots) {
    usedStationsByTimeslot.set(timeslot.id, new Set());
  }

  const allocations: PlanV2["allocations"] = [];
  const byesByTimeslot: Record<Id, Id[]> = {};
  const segments = resolveSegmentIds(config);
  for (const timeslot of timeslots) {
    byesByTimeslot[timeslot.id] = [];
  }

  for (const segmentId of segments) {
    const rounds = roundsBySegment.get(segmentId) ?? [];
    const repeatCounter = new Map<Id, Map<Id, number>>();
    const entries: Array<{
      timeslotId: Id;
      timeslotIndex: number;
      round: RoundRobinRound;
      candidateStationIds: Id[];
      allowedLocationKey: string;
    }> = [];

    for (
      let roundIndex = 0;
      roundIndex < rounds.length && roundIndex < activeTimeslots.length;
      roundIndex += 1
    ) {
      const round = rounds[roundIndex];
      const timeslot = activeTimeslots[roundIndex];
      if (round.bye) {
        byesByTimeslot[timeslot.id].push(round.bye);
        // Allocate bye group to pause station if configured
        if (config.pauseActivity) {
          const allowedLocs = locationForSegmentTimeslot(config, segmentId, timeslot.id);
          const pauseStation = config.stations.find(
            (s) => s.activityTypeId === "activity-pause" && allowedLocs.includes(s.locationId)
              && !usedStationsByTimeslot.get(timeslot.id)?.has(s.id)
          );
          if (pauseStation) {
            allocations.push({
              id: `alloc-${timeslot.id}-${pauseStation.id}-${segmentId}`,
              timeslotId: timeslot.id,
              stationId: pauseStation.id,
              groupIds: [round.bye],
            });
            usedStationsByTimeslot.get(timeslot.id)?.add(pauseStation.id);
          }
        }
      }

      const allowedLocations = locationForSegmentTimeslot(config, segmentId, timeslot.id);
      const candidateStationIds = allowedLocations
        .flatMap((locationId) => stationsByLocation.get(locationId) ?? [])
        .filter((stationId) => !usedStationsByTimeslot.get(timeslot.id)?.has(stationId))
        .filter((stationId) => stationsById.get(stationId)?.activityTypeId !== "activity-pause")
        .sort((a, b) => a.localeCompare(b));

      if (candidateStationIds.length < round.matches.length) {
        throw new NoSolutionError(
          `No solution: timeslot ${timeslot.id}, segment ${segmentId} has ${round.matches.length} matches and ${candidateStationIds.length} stations.`
        );
      }

      entries.push({
        timeslotId: timeslot.id,
        timeslotIndex: timeslot.index,
        round,
        candidateStationIds,
        allowedLocationKey: allowedLocations.join("|"),
      });
    }

    const blocks: BlockRoundContext[][] = [];
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex];
      const optionsForRound = enumerateRoundAssignmentOptions(
        entry.round.matches,
        entry.candidateStationIds,
        stationsById
      );
      if (optionsForRound.length === 0) {
        throw new NoSolutionError(
          `No solution: no station assignments possible in slot ${entry.timeslotId}.`
        );
      }
      const context: BlockRoundContext = {
        timeslotId: entry.timeslotId,
        timeslotIndex: entry.timeslotIndex,
        round: entry.round,
        candidateStationIds: entry.candidateStationIds,
        allowedLocationKey: entry.allowedLocationKey,
        options: optionsForRound,
      };
      const lastBlock = blocks[blocks.length - 1];
      const previousEntry = entries[entryIndex - 1];
      if (!lastBlock || previousEntry?.allowedLocationKey !== entry.allowedLocationKey) {
        blocks.push([context]);
        continue;
      }
      lastBlock.push(context);
    }

    for (const block of blocks) {
      // Splits grote blokken in sub-blokken van max 4 rondes.
      // Per-match DFS met maxNodes budget kan grotere blokken aan,
      // maar sub-blokken van 4 geven de per-ronde DFS fallback voldoende ruimte.
      const sorted = block.sort((a, b) => a.timeslotIndex - b.timeslotIndex);
      const maxSubBlockSize = Math.max(4, Math.min(sorted.length, 8));

      const selected: RoundAssignmentOption[] = [];
      for (let subStart = 0; subStart < sorted.length; subStart += maxSubBlockSize) {
        const subBlock = sorted.slice(subStart, subStart + maxSubBlockSize);
        // Sub-blokken van ≤4 rondes: ruimere limieten (bewezen snel via pruning)
        const subMs = subBlock.length <= 8 ? Math.max(maxBlockSearchMs, 2_000) : maxBlockSearchMs;
        const subNodes = subBlock.length <= 8 ? Math.max(maxBlockNodes, 2_000_000) : maxBlockNodes;
        const subSelected = chooseBlockExactAssignments(
          subBlock,
          repeatCounter,
          stationsById,
          hardRepeatConstraint,
          subMs,
          subNodes
        );
        for (let i = 0; i < subBlock.length; i++) {
          selected.push(subSelected[i]);
          // Update repeatCounter zodat het volgende sub-blok de herhalingen ziet
          if (subSelected[i]) {
            applyAssignmentOption(repeatCounter, subSelected[i], stationsById);
          }
        }
      }

      for (let i = 0; i < sorted.length; i += 1) {
        const context = sorted[i];
        const option = selected[i];
        if (!option) {
          throw new NoSolutionError(
            `No solution: missing exact assignment for slot ${context.timeslotId}.`
          );
        }
        for (const assignment of option.assignments) {
          const [g1, g2] = assignment.match;
          const station = stationsById.get(assignment.stationId);
          if (!station) {
            throw new NoSolutionError(`Unknown station ${assignment.stationId}.`);
          }
          allocations.push({
            id: `alloc-${context.timeslotId}-${assignment.stationId}-${segmentId}-${g1}-${g2}`,
            timeslotId: context.timeslotId,
            stationId: assignment.stationId,
            groupIds: [g1, g2],
          });
          usedStationsByTimeslot.get(context.timeslotId)?.add(assignment.stationId);
        }
      }
    }
  }

  const plan: PlanV2 = {
    id: `plan-${config.id}`,
    configId: config.id,
    allocations,
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  return { plan, byesByTimeslot };
}

export function assignToStations(
  config: ConfigV2,
  roundsBySegment: Map<Id, RoundRobinRound[]>,
  options: AssignToStationsOptions = {}
): GenerateResultV2 {
  if (options.mode === "blockExact") {
    return assignToStationsByExactBlocks(config, roundsBySegment, options);
  }
  return assignToStationsBySlot(config, roundsBySegment);
}

function hasBlockPolicyViolations(plan: PlanV2, config: ConfigV2): boolean {
  if (config.movementPolicy !== "blocks") {
    return false;
  }
  const stationById = new Map(config.stations.map((station) => [station.id, station]));
  const groupSegmentById = new Map(config.groups.map((group) => [group.id, group.segmentId]));

  for (const allocation of plan.allocations) {
    const segmentId = allocationSegmentId(config, allocation, groupSegmentById);
    if (!segmentId) {
      continue;
    }
    const station = stationById.get(allocation.stationId);
    if (!station) {
      return true;
    }
    let allowedLocations: Id[];
    try {
      allowedLocations = locationForSegmentTimeslot(config, segmentId, allocation.timeslotId);
    } catch {
      return true;
    }
    if (!allowedLocations.includes(station.locationId)) {
      return true;
    }
  }
  return false;
}

interface OptimizeLocalIterativeOptions {
  maxIterations?: number;
  maxIters?: number;
}

export interface OptimizerAppliedMove {
  type: "move" | "swap";
  timeslotId: Id;
  timeslotIndex: number;
  segmentId: Id;
  allocationId: Id;
  otherAllocationId?: Id;
  toStationId?: Id;
  fromStationId: Id;
  scoreBefore: number;
  scoreAfter: number;
}

export interface OptimizePlanLocalIterativeResult {
  plan: PlanV2;
  beforeScore: number;
  afterScore: number;
  iterations: number;
  appliedMoves: OptimizerAppliedMove[];
}

interface OptimizerCandidate {
  type: "move" | "swap";
  timeslotId: Id;
  timeslotIndex: number;
  segmentId: Id;
  allocationId: Id;
  otherAllocationId?: Id;
  fromStationId: Id;
  toStationId?: Id;
  stationPairKey: string;
  nextPlan: PlanV2;
  nextScore: number;
}

function compareCandidates(a: OptimizerCandidate, b: OptimizerCandidate): number {
  if (a.nextScore !== b.nextScore) {
    return a.nextScore - b.nextScore;
  }
  const typeRankA = a.type === "move" ? 0 : 1;
  const typeRankB = b.type === "move" ? 0 : 1;
  if (typeRankA !== typeRankB) {
    return typeRankA - typeRankB;
  }
  if (a.timeslotIndex !== b.timeslotIndex) {
    return a.timeslotIndex - b.timeslotIndex;
  }
  const allocationCmp = a.allocationId.localeCompare(b.allocationId);
  if (allocationCmp !== 0) {
    return allocationCmp;
  }
  const otherCmp = (a.otherAllocationId ?? "").localeCompare(b.otherAllocationId ?? "");
  if (otherCmp !== 0) {
    return otherCmp;
  }
  return a.stationPairKey.localeCompare(b.stationPairKey);
}

function isValidCandidatePlan(
  config: ConfigV2,
  candidatePlan: PlanV2,
  currentScore: number,
  hardRepeatConstraint: boolean
): { ok: boolean; nextScore: number } {
  const nextScore = totalRepeatPenalty(candidatePlan, config);
  if (nextScore >= currentScore) {
    return { ok: false, nextScore };
  }
  if (hardRepeatConstraint && nextScore > 0) {
    return { ok: false, nextScore };
  }
  if (hasBlockPolicyViolations(candidatePlan, config)) {
    return { ok: false, nextScore };
  }
  if (hasHardErrors(validatePlan(candidatePlan, config))) {
    return { ok: false, nextScore };
  }
  return { ok: true, nextScore };
}

export function optimizePlanLocalIterative(
  config: ConfigV2,
  plan: PlanV2,
  options: OptimizeLocalIterativeOptions = {}
): OptimizePlanLocalIterativeResult {
  const maxIterations = Math.max(
    1,
    options.maxIterations ?? options.maxIters ?? 200
  );
  const hardRepeatConstraint = isHardRepeatMode(config);
  const timeslots = [...config.timeslots]
    .filter((timeslot) => timeslot.kind === "active")
    .sort((a, b) => a.index - b.index);
  const segmentIds = resolveSegmentIds(config).sort((a, b) => a.localeCompare(b));
  const groupSegmentById = new Map(config.groups.map((group) => [group.id, group.segmentId]));
  const stationById = new Map(config.stations.map((station) => [station.id, station]));
  const stationsByLocation = new Map<Id, Id[]>();
  for (const station of config.stations) {
    const list = stationsByLocation.get(station.locationId) ?? [];
    list.push(station.id);
    stationsByLocation.set(station.locationId, sortedIds(list));
  }
  const allowedStationsCache = new Map<string, Id[]>();
  const allowedStationsFor = (timeslotId: Id, segmentId: Id): Id[] => {
    const key = `${timeslotId}::${segmentId}`;
    const cached = allowedStationsCache.get(key);
    if (cached) {
      return cached;
    }
    let locations: Id[];
    try {
      locations = locationForSegmentTimeslot(config, segmentId, timeslotId);
    } catch {
      allowedStationsCache.set(key, []);
      return [];
    }
    const stations = sortedIds(
      locations.flatMap((locationId) => stationsByLocation.get(locationId) ?? [])
    );
    allowedStationsCache.set(key, stations);
    return stations;
  };

  const beforeScore = totalRepeatPenalty(plan, config);
  let workingPlan = copyPlan(plan);
  let workingScore = beforeScore;
  const appliedMoves: OptimizerAppliedMove[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let bestCandidate: OptimizerCandidate | null = null;

    for (const timeslot of timeslots) {
      const slotAllocations = workingPlan.allocations
        .filter((allocation) => allocation.timeslotId === timeslot.id)
        .sort((a, b) => a.id.localeCompare(b.id));
      const slotUsedStations = new Set(slotAllocations.map((allocation) => allocation.stationId));

      for (const segmentId of segmentIds) {
        const allowedStations = allowedStationsFor(timeslot.id, segmentId);
        if (allowedStations.length === 0) {
          continue;
        }
        const allowedSet = new Set(allowedStations);
        const segmentAllocations = slotAllocations
          .filter(
            (allocation) =>
              allocationSegmentId(config, allocation, groupSegmentById) === segmentId
          )
          .sort((a, b) => a.id.localeCompare(b.id));
        if (segmentAllocations.length === 0) {
          continue;
        }

        // A) Move-to-empty candidates
        const emptyStations = allowedStations
          .filter((stationId) => !slotUsedStations.has(stationId))
          .sort((a, b) => a.localeCompare(b));
        for (const allocation of segmentAllocations) {
          for (const toStationId of emptyStations) {
            const station = stationById.get(toStationId);
            if (!station) {
              continue;
            }
            const groupCount = allocation.groupIds.length;
            if (
              groupCount < station.capacityGroupsMin ||
              groupCount > station.capacityGroupsMax
            ) {
              continue;
            }
            const candidatePlan = withMovedStation(workingPlan, allocation.id, toStationId);
            const validation = isValidCandidatePlan(
              config,
              candidatePlan,
              workingScore,
              hardRepeatConstraint
            );
            if (!validation.ok) {
              continue;
            }
            const candidate: OptimizerCandidate = {
              type: "move",
              timeslotId: timeslot.id,
              timeslotIndex: timeslot.index,
              segmentId,
              allocationId: allocation.id,
              fromStationId: allocation.stationId,
              toStationId,
              stationPairKey: toStationId,
              nextPlan: candidatePlan,
              nextScore: validation.nextScore,
            };
            if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
              bestCandidate = candidate;
            }
          }
        }

        // B) Swap candidates (same slot + segment)
        for (let i = 0; i < segmentAllocations.length; i += 1) {
          for (let j = i + 1; j < segmentAllocations.length; j += 1) {
            const left = segmentAllocations[i];
            const right = segmentAllocations[j];
            if (left.stationId === right.stationId) {
              continue;
            }
            if (!allowedSet.has(left.stationId) || !allowedSet.has(right.stationId)) {
              continue;
            }
            const leftTargetStation = stationById.get(right.stationId);
            const rightTargetStation = stationById.get(left.stationId);
            if (!leftTargetStation || !rightTargetStation) {
              continue;
            }
            if (
              left.groupIds.length < leftTargetStation.capacityGroupsMin ||
              left.groupIds.length > leftTargetStation.capacityGroupsMax
            ) {
              continue;
            }
            if (
              right.groupIds.length < rightTargetStation.capacityGroupsMin ||
              right.groupIds.length > rightTargetStation.capacityGroupsMax
            ) {
              continue;
            }

            const candidatePlan = withSwappedStations(workingPlan, left.id, right.id);
            const validation = isValidCandidatePlan(
              config,
              candidatePlan,
              workingScore,
              hardRepeatConstraint
            );
            if (!validation.ok) {
              continue;
            }
            const stationPairKey = [left.stationId, right.stationId]
              .sort((a, b) => a.localeCompare(b))
              .join("|");
            const candidate: OptimizerCandidate = {
              type: "swap",
              timeslotId: timeslot.id,
              timeslotIndex: timeslot.index,
              segmentId,
              allocationId: left.id,
              otherAllocationId: right.id,
              fromStationId: left.stationId,
              toStationId: right.stationId,
              stationPairKey,
              nextPlan: candidatePlan,
              nextScore: validation.nextScore,
            };
            if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
              bestCandidate = candidate;
            }
          }
        }
      }
    }

    if (!bestCandidate) {
      break;
    }

    appliedMoves.push({
      type: bestCandidate.type,
      timeslotId: bestCandidate.timeslotId,
      timeslotIndex: bestCandidate.timeslotIndex,
      segmentId: bestCandidate.segmentId,
      allocationId: bestCandidate.allocationId,
      otherAllocationId: bestCandidate.otherAllocationId,
      toStationId: bestCandidate.toStationId,
      fromStationId: bestCandidate.fromStationId,
      scoreBefore: workingScore,
      scoreAfter: bestCandidate.nextScore,
    });
    workingPlan = bestCandidate.nextPlan;
    workingScore = bestCandidate.nextScore;
  }

  return {
    plan: workingPlan,
    beforeScore,
    afterScore: workingScore,
    iterations: appliedMoves.length,
    appliedMoves,
  };
}

export function optimizePlanLocal(
  config: ConfigV2,
  plan: PlanV2,
  options: OptimizeLocalIterativeOptions = {}
): PlanV2 {
  return optimizePlanLocalIterative(config, plan, options).plan;
}

function perturbPlanForRestart(config: ConfigV2, plan: PlanV2, restartIndex: number): PlanV2 {
  if (restartIndex <= 0) {
    return copyPlan(plan);
  }
  const groupSegmentById = new Map(config.groups.map((group) => [group.id, group.segmentId]));
  const next = copyPlan(plan);
  const bySlotAndSegment = new Map<string, PlanV2["allocations"]>();

  for (const allocation of next.allocations) {
    const segmentId = allocationSegmentId(config, allocation, groupSegmentById);
    if (!segmentId) {
      continue;
    }
    const key = `${allocation.timeslotId}::${segmentId}`;
    const list = bySlotAndSegment.get(key) ?? [];
    list.push(allocation);
    bySlotAndSegment.set(key, list);
  }

  for (const allocations of bySlotAndSegment.values()) {
    const ordered = [...allocations].sort((a, b) => a.id.localeCompare(b.id));
    if (ordered.length <= 1) {
      continue;
    }
    const rotateBy = restartIndex % ordered.length;
    if (rotateBy === 0) {
      continue;
    }
    const stationIds = ordered.map((allocation) => allocation.stationId);
    for (let i = 0; i < ordered.length; i += 1) {
      ordered[i].stationId = stationIds[(i + rotateBy) % ordered.length];
    }
  }

  return next;
}

export function optimizeWithRestarts(
  config: ConfigV2,
  plan: PlanV2,
  options: GeneratePlanOptions
): OptimizePlanLocalIterativeResult {
  const maxIterations = Math.max(1, options.optimizer?.maxIterations ?? 200);
  const restarts = Math.max(1, options.optimizer?.restarts ?? 1);
  let best = optimizePlanLocalIterative(config, plan, { maxIterations });
  if (restarts === 1) {
    return best;
  }

  for (let restart = 1; restart < restarts; restart += 1) {
    const perturbed = perturbPlanForRestart(config, plan, restart);
    const attempt = optimizePlanLocalIterative(config, perturbed, { maxIterations });
    if (attempt.afterScore < best.afterScore) {
      best = attempt;
    }
  }
  return best;
}

// ── Algebraïsche constructie: 0-repeat station-toewijzing ─────────────
// Genereert round-robin + station-toewijzing SAMEN via modulaire arithmetiek.
// Werkt voor H groepen/pool (even) waarbij H/2 niet 2 of 6 is.
// Ronde r: A[i] vs B[(i+r) % H], station = (k*i + r) % H met gcd(k,H)=1 en gcd(k-1,H)=1.

function constructPerfectBlock(groupIds: Id[], stationIds: Id[], roundCount: number): {
  rounds: RoundRobinRound[];
  stationAssignments: Map<number, Id[]>; // roundIndex → stationId per match
} | null {
  const H = Math.floor(groupIds.length / 2);
  if (H < 3 || H === 6) return null;
  if (stationIds.length < H) return null;

  // Splits groepen in twee helften
  const sorted = sortedIds(groupIds);
  const halfA = sorted.slice(0, H);
  const halfB = sorted.slice(H, H * 2);
  const hasGhost = groupIds.length % 2 === 1;
  if (hasGhost) return null; // Oneven groepen: complexer, skip

  // Vind k zodat gcd(k, H)=1 en gcd(k-1, H)=1
  function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
  let k = -1;
  for (let candidate = 2; candidate < H; candidate++) {
    if (gcd(candidate, H) === 1 && gcd(candidate - 1, H) === 1) { k = candidate; break; }
  }
  if (k < 0) return null;

  const rounds: RoundRobinRound[] = [];
  const stationAssignments = new Map<number, Id[]>();

  const roundsToGenerate = Math.min(H, roundCount);
  for (let r = 0; r < roundsToGenerate; r++) {
    const matches: Array<[Id, Id]> = [];
    const stations: Id[] = [];
    for (let i = 0; i < H; i++) {
      const a = halfA[i];
      const b = halfB[(i + r) % H];
      matches.push(a < b ? [a, b] : [b, a]);
      stations.push(stationIds[((k * i + r) % H + H) % H]);
    }
    rounds.push({
      matches: matches.sort(([a1, b1], [a2, b2]) =>
        `${a1}-${b1}`.localeCompare(`${a2}-${b2}`)
      ),
      bye: undefined,
    });
    // Station-volgorde moet matchen met gesorteerde match-volgorde
    const originalMatches: Array<[Id, Id]> = [];
    for (let i = 0; i < H; i++) {
      const a = halfA[i];
      const b = halfB[(i + r) % H];
      originalMatches.push(a < b ? [a, b] : [b, a]);
    }
    const sortedMatchKeys = rounds[rounds.length - 1].matches.map(([a, b]) => `${a}-${b}`);
    const reorderedStations = sortedMatchKeys.map((key) => {
      const origIdx = originalMatches.findIndex(([a, b]) => `${a}-${b}` === key);
      return stations[origIdx];
    });
    stationAssignments.set(r, reorderedStations);
  }

  // Vul resterende rondes (als roundCount > H) met herhaalde rondes
  for (let r = H; r < roundCount; r++) {
    const srcRound = rounds[r % H];
    rounds.push({ ...srcRound });
    stationAssignments.set(r, stationAssignments.get(r % H)!);
  }

  return { rounds, stationAssignments };
}

export function tryAlgebraicPlan(config: ConfigV2): GenerateResultV2 | null {
  if (config.movementPolicy !== "blocks") return null;
  if (!config.locationBlocks || config.locationBlocks.length === 0) return null;

  const activeTimeslots = [...config.timeslots]
    .filter((t) => t.kind === "active")
    .sort((a, b) => a.index - b.index);
  const bySegment = groupIdsBySegment(config);
  const stationsByLocation = new Map<Id, Id[]>();
  for (const station of config.stations) {
    const list = stationsByLocation.get(station.locationId) ?? [];
    list.push(station.id);
    stationsByLocation.set(station.locationId, sortedIds(list));
  }

  const allocations: PlanV2["allocations"] = [];
  const byesByTimeslot: Record<Id, Id[]> = {};
  for (const ts of config.timeslots) byesByTimeslot[ts.id] = [];

  for (const segmentId of resolveSegmentIds(config)) {
    const groupIds = bySegment.get(segmentId) ?? [];
    if (groupIds.length < 6) return null; // Te klein voor constructie

    for (const block of config.locationBlocks!) {
      const blockTimeslots = activeTimeslots.filter((t) => block.timeslotIds.includes(t.id));
      if (blockTimeslots.length === 0) continue;

      const locationId = block.segmentLocationMap[segmentId];
      if (!locationId) return null;
      const blockStationIds = stationsByLocation.get(locationId) ?? [];
      if (blockStationIds.length === 0) return null;

      const result = constructPerfectBlock(groupIds, blockStationIds, blockTimeslots.length);
      if (!result) return null;

      for (let roundIdx = 0; roundIdx < blockTimeslots.length; roundIdx++) {
        const timeslot = blockTimeslots[roundIdx];
        const round = result.rounds[roundIdx];
        const stations = result.stationAssignments.get(roundIdx);
        if (!stations) return null;

        if (round.bye) byesByTimeslot[timeslot.id].push(round.bye);

        for (let m = 0; m < round.matches.length; m++) {
          const [g1, g2] = round.matches[m];
          allocations.push({
            id: `alloc-${allocations.length + 1}`,
            timeslotId: timeslot.id,
            stationId: stations[m],
            groupIds: [g1, g2],
          });
        }
      }
    }
  }

  if (allocations.length === 0) return null;

  return {
    plan: {
      id: `plan-algebraic-${Date.now()}`,
      configId: config.id,
      allocations,
      version: 1,
      updatedAt: new Date().toISOString(),
    },
    byesByTimeslot,
  };
}

// ---------------------------------------------------------------------------
// generateBestPlan — nieuwe entry point (stap 1.5)
// ---------------------------------------------------------------------------

export interface GenerateBestPlanResult {
  plan: PlanV2;
  byesByTimeslot: Record<Id, Id[]>;
  feasibility: FeasibilityReport;
  achievedScore: PlanScoreBreakdown;
  strategyUsed: string;
  attempts: Array<{
    strategyName: string;
    score: PlanScoreBreakdown | null;
    failed?: string;
  }>;
}

/**
 * Probeert alle applicable strategieën uit de registry, draait per plan de
 * repair-pass, scoort met `computePlanScore`, en retourneert het beste
 * resultaat. Zie `docs/generator-design.md` §2.3.
 */
export function generateBestPlan(
  config: ConfigV2,
  options: GeneratePlanOptions = {}
): GenerateBestPlanResult {
  const feasibility = analyzePlanFeasibility(config);

  const attempts: GenerateBestPlanResult["attempts"] = [];
  let best: { attempt: PlanAttempt; score: PlanScoreBreakdown } | null = null;

  const SLOW_STRATEGIES = new Set(["shuffled-rounds"]);
  // Mode-detectie: expliciete mode-veld wint. Anders fallback op station-capaciteit:
  // als alle niet-pauze stations cap-1 hebben → Solo. Vermijdt edge case waarin
  // mode-veld kwijt is en de Vs-strategies dan op cap-1 stations zouden falen.
  let isSoloMode = config.scheduleSettings.mode === "solo";
  if (config.scheduleSettings.mode === undefined) {
    const playable = config.stations.filter((s) => s.activityTypeId !== "activity-pause");
    if (playable.length > 0 && playable.every((s) => s.capacityGroupsMax === 1)) {
      isSoloMode = true;
    }
  }

  for (const strategy of STRATEGY_REGISTRY) {
    if (options.fastStrategiesOnly && SLOW_STRATEGIES.has(strategy.name)) continue;
    // Mode-gate: alleen solo-rotation draait in Solo-modus; alle andere
    // strategies veronderstellen capaciteit 2 (wedstrijd-pairing).
    if (isSoloMode && strategy.name !== "solo-rotation") continue;
    if (!isSoloMode && strategy.name === "solo-rotation") continue;
    if (!strategy.applicable(config, feasibility)) continue;

    let attempt: PlanAttempt | null = null;
    try {
      attempt = strategy.generate(config, feasibility, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({ strategyName: strategy.name, score: null, failed: message });
      continue;
    }

    if (!attempt) {
      attempts.push({ strategyName: strategy.name, score: null, failed: "returned null" });
      continue;
    }

    // Repair-pass: dezelfde flow als de oude generatePlanStandard — local iterative
    // optimizer + station re-assignment. Algebraic-plannen profiteren hier
    // ook van (hun matchups zijn al 0-repeat voor spel, maar de repair
    // kan occupancy of matchup-spreiding nog verbeteren).
    //
    // Als de strategie een eigen scoringConfig meelevert (bv. bye-assisted
    // met een extra timeslot), gebruiken we die voor de repair en scoring.
    const repairConfig = attempt.scoringConfig ?? config;
    let repairedPlan = attempt.plan;
    const assignedPenalty = totalRepeatPenalty(attempt.plan, repairConfig);

    if (assignedPenalty > 0) {
      const optimized = optimizeWithRestarts(repairConfig, attempt.plan, options);
      repairedPlan = optimized.plan;

      const optimizedPenalty = totalRepeatPenalty(repairedPlan, repairConfig);
      if (optimizedPenalty > 0) {
        const a0MaxBlockSearchMs = Math.max(options.assignment?.maxBlockSearchMs ?? 300, 300);
        const a0MaxBlockNodes = Math.max(options.assignment?.maxBlockNodes ?? 120_000, 120_000);
        const stationOpt = optimizeExistingPlanStations(repairConfig, repairedPlan, {
          maxBlockSearchMs: a0MaxBlockSearchMs,
          maxBlockNodes: a0MaxBlockNodes,
        });
        if (stationOpt.repeatPenaltyAfter <= optimizedPenalty) {
          repairedPlan = stationOpt.plan;
        }
      }

      // Cross-slot repair: station-swaps tussen timeslots die de
      // within-slot optimizer niet kan doen.
      const afterA0Penalty = totalRepeatPenalty(repairedPlan, repairConfig);
      if (afterA0Penalty > 0) {
        const repairFeasibility = attempt.scoringConfig
          ? analyzePlanFeasibility(repairConfig)
          : feasibility;
        const crossResult = crossSlotRepair(repairConfig, repairedPlan, {
          feasibility: repairFeasibility,
        });
        if (totalRepeatPenalty(crossResult.plan, repairConfig) < afterA0Penalty) {
          repairedPlan = crossResult.plan;
        }
      }
    }

    const scoreFeasibility = attempt.scoringConfig
      ? analyzePlanFeasibility(repairConfig)
      : feasibility;
    const score = computePlanScore(repairedPlan, repairConfig, scoreFeasibility);
    attempts.push({ strategyName: strategy.name, score });

    if (!best || score.totalScore > best.score.totalScore) {
      best = {
        attempt: { ...attempt, plan: repairedPlan },
        score,
      };
    }
  }

  if (!best) {
    throw new NoSolutionError(
      "Geen enkele strategie kon een plan produceren voor deze configuratie."
    );
  }

  // Post-hoc validatie: hard-mode check en structurele fouten, zoals
  // de oude generatePlanStandard dat ook deed. Als de winnende strategie
  // een eigen scoringConfig heeft (bv. bye-assisted met extra timeslot),
  // valideren we tegen die config.
  const validationConfig = best.attempt.scoringConfig ?? config;
  const finalIssues = validatePlan(best.attempt.plan, validationConfig);

  if (isHardRepeatMode(config)) {
    const repeatErrors = finalIssues.filter(
      (issue) =>
        issue.type === "REPEAT_ACTIVITYTYPE_FOR_GROUP" && issue.severity === "error"
    );
    if (repeatErrors.length > 0) {
      throw new NoSolutionError(
        "Geen oplossing gevonden zonder herhaling van hetzelfde speltype in hard modus."
      );
    }
  }

  if (hasHardErrors(finalIssues)) {
    const first = finalIssues.find((issue) => issue.severity === "error");
    throw new Error(`Generation failed: ${first?.message ?? "unknown error"}`);
  }

  return {
    plan: best.attempt.plan,
    byesByTimeslot: best.attempt.byesByTimeslot,
    feasibility,
    achievedScore: best.score,
    strategyUsed: best.attempt.strategyName,
    attempts,
  };
}

// generatePlan alias verwijderd in fase 3 stap 3.7.
// Alle aanroepers gebruiken nu generateBestPlan.

export interface StationReassignmentChange {
  allocationId: Id;
  fromStationId: Id;
  toStationId: Id;
}

export interface OptimizeExistingPlanStationsOptions {
  maxBlockSearchMs?: number;
  maxBlockNodes?: number;
  repairIterations?: number;
}

export interface OptimizeExistingPlanStationsResult {
  plan: PlanV2;
  repeatPenaltyBefore: number;
  repeatPenaltyAfter: number;
  solvedZero: boolean;
  changedAllocations: StationReassignmentChange[];
}

function allocationKey(allocation: PlanV2["allocations"][number]): string {
  const groupKey = [...new Set(allocation.groupIds)].sort((a, b) => a.localeCompare(b)).join("|");
  return `${allocation.timeslotId}::${groupKey}`;
}

function roundsFromExistingPlan(config: ConfigV2, plan: PlanV2): Map<Id, RoundRobinRound[]> {
  const segmentIds = resolveSegmentIds(config);
  const activeTimeslots = [...config.timeslots]
    .filter((timeslot) => timeslot.kind === "active")
    .sort((a, b) => a.index - b.index);
  const groupSegmentById = new Map(config.groups.map((group) => [group.id, group.segmentId]));
  const groupsBySegment = groupIdsBySegment(config);

  const roundsBySegment = new Map<Id, RoundRobinRound[]>();
  for (const segmentId of segmentIds) {
    roundsBySegment.set(segmentId, []);
  }

  for (const segmentId of segmentIds) {
    const rounds = roundsBySegment.get(segmentId) ?? [];
    const segmentGroups = groupsBySegment.get(segmentId) ?? [];
    for (const timeslot of activeTimeslots) {
      const slotAllocations = plan.allocations
        .filter((allocation) => allocation.timeslotId === timeslot.id)
        .filter(
          (allocation) =>
            allocationSegmentId(config, allocation, groupSegmentById) === segmentId
        )
        .sort((a, b) => a.id.localeCompare(b.id));

      const matches: Array<[Id, Id]> = [];
      const usedGroups = new Set<Id>();
      for (const allocation of slotAllocations) {
        const uniqueGroups = [...new Set(allocation.groupIds)].sort((a, b) => a.localeCompare(b));
        if (uniqueGroups.length < 2) {
          continue;
        }
        const [g1, g2] = uniqueGroups;
        matches.push(g1 < g2 ? [g1, g2] : [g2, g1]);
        usedGroups.add(g1);
        usedGroups.add(g2);
      }
      const byes = segmentGroups.filter((groupId) => !usedGroups.has(groupId));
      rounds.push({
        matches: matches.sort(([a1, b1], [a2, b2]) =>
          `${a1}-${b1}`.localeCompare(`${a2}-${b2}`)
        ),
        bye: byes.length === 1 ? byes[0] : undefined,
      });
    }
    roundsBySegment.set(segmentId, rounds);
  }

  return roundsBySegment;
}

export function optimizeExistingPlanStations(
  config: ConfigV2,
  plan: PlanV2,
  options: OptimizeExistingPlanStationsOptions = {}
): OptimizeExistingPlanStationsResult {
  const repeatPenaltyBefore = totalRepeatPenalty(plan, config);
  const originalByAllocationId = new Map(
    plan.allocations.map((allocation) => [allocation.id, allocation.stationId])
  );

  let candidatePlan = copyPlan(plan);
  try {
    const roundsBySegment = roundsFromExistingPlan(config, plan);
    const reassigned = assignToStations(config, roundsBySegment, {
      mode: "blockExact",
      maxBlockSearchMs: options.maxBlockSearchMs,
      maxBlockNodes: options.maxBlockNodes,
    });
    const reassignedByKey = new Map(
      reassigned.plan.allocations.map((allocation) => [allocationKey(allocation), allocation.stationId])
    );

    candidatePlan = {
      ...plan,
      allocations: plan.allocations.map((allocation) => {
        const nextStationId = reassignedByKey.get(allocationKey(allocation));
        if (!nextStationId) {
          return { ...allocation };
        }
        return {
          ...allocation,
          stationId: nextStationId,
        };
      }),
      version: plan.version + 1,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    candidatePlan = copyPlan(plan);
  }

  const repaired = optimizePlanLocalIterative(config, candidatePlan, {
    maxIterations: Math.max(1, options.repairIterations ?? 240),
  });
  if (repaired.afterScore <= totalRepeatPenalty(candidatePlan, config)) {
    candidatePlan = {
      ...repaired.plan,
      version: candidatePlan.version + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  const candidateIssues = validatePlan(candidatePlan, config);
  const repeatPenaltyAfterCandidate = totalRepeatPenalty(candidatePlan, config);

  const finalPlan =
    hasHardErrors(candidateIssues) || repeatPenaltyAfterCandidate > repeatPenaltyBefore
      ? copyPlan(plan)
      : candidatePlan;
  const finalIssues = validatePlan(finalPlan, config);
  const repeatPenaltyAfter = totalRepeatPenalty(finalPlan, config);
  const solvedZero =
    !hasHardErrors(finalIssues) &&
    repeatPenaltyAfter === 0 &&
    finalIssues.filter((issue) => issue.type === "REPEAT_ACTIVITYTYPE_FOR_GROUP").length === 0;

  const changedAllocations = finalPlan.allocations
    .map((allocation) => {
      const fromStationId = originalByAllocationId.get(allocation.id);
      if (!fromStationId || fromStationId === allocation.stationId) {
        return null;
      }
      return {
        allocationId: allocation.id,
        fromStationId,
        toStationId: allocation.stationId,
      };
    })
    .filter((entry): entry is StationReassignmentChange => Boolean(entry))
    .sort((a, b) => a.allocationId.localeCompare(b.allocationId));

  return {
    plan: finalPlan,
    repeatPenaltyBefore,
    repeatPenaltyAfter,
    solvedZero,
    changedAllocations,
  };
}

export function computeByesByTimeslot(config: ConfigV2, plan: PlanV2): Record<Id, Id[]> {
  const bySlot: Record<Id, Id[]> = {};
  const groupIdsBySegmentMap = groupIdsBySegment(config);
  for (const timeslot of config.timeslots) {
    const slotAllocs = plan.allocations.filter((allocation) => allocation.timeslotId === timeslot.id);
    const usedGroups = new Set(slotAllocs.flatMap((allocation) => allocation.groupIds));
    const byes: Id[] = [];
    for (const groups of groupIdsBySegmentMap.values()) {
      for (const groupId of groups) {
        if (!usedGroups.has(groupId) && timeslot.kind === "active") {
          byes.push(groupId);
        }
      }
    }
    bySlot[timeslot.id] = sortedIds(byes);
  }
  return bySlot;
}
