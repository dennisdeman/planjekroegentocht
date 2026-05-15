import type { ConfigV2, ScheduleMode, TimeslotV2 } from "./model";
import { findSpelByName } from "./spel-registry";

// ---------------------------------------------------------------------------
// Schedule calculation
// ---------------------------------------------------------------------------

export interface CalcResult {
  groupsPerPool: number;
  roundRobinRounds: number;
  matchesPerRound: number;
  stationsPerLocation: number;
  totalStations: number;
  spellenNeeded: number;
  hasBye: boolean;
  /** Actual rounds to play (depends on scheduleMode) */
  roundsNeeded: number;
  totalActiveSlots: number;
  breakAfterSlot: number;
  totalSlots: number;
  enoughSpellen: boolean;
  spelDeficit: number;
  /** Whether spellen > round-robin rounds (user should choose) */
  spellenExceedRounds: boolean;
  matchupMaxNeeded: number;
}

export function calculateSchedule(
  groupCount: number,
  poolCount: number,
  spelCount: number,
  movementPolicy: "free" | "blocks",
  locationCount: number,
  scheduleMode: ScheduleMode,
  stationLayout: "same" | "split",
  /** Actual per-pool group counts. When provided, uses largest pool for schedule math. */
  poolSizes?: number[],
  /** Auto-insert pauze-slot halverwege. Default false — voor kroegentocht is een pauze
   *  meestal een eet- of stadsmoment dat de gebruiker zelf aangeeft. */
  enableBreak?: boolean,
): CalcResult {
  // Use largest pool for schedule math (determines rounds, stations, etc.)
  const largestPool = poolSizes?.length
    ? Math.max(...poolSizes)
    : (poolCount > 1 ? Math.ceil(groupCount / poolCount) : groupCount);
  const groupsPerPool = largestPool;
  // Bye if ANY pool has an odd number of groups
  const hasBye = poolSizes?.length
    ? poolSizes.some((s) => s % 2 === 1)
    : groupsPerPool % 2 === 1;
  const roundRobinRounds = largestPool - 1;
  const matchesPerRound = Math.floor(largestPool / 2);
  const stationsPerLocation = matchesPerRound;

  let totalStations: number;
  let spellenNeeded: number;
  if (movementPolicy === "blocks" && poolCount > 1) {
    const locs = Math.max(locationCount, poolCount);
    if (stationLayout === "same") {
      totalStations = stationsPerLocation * locs;
      spellenNeeded = stationsPerLocation;
    } else {
      totalStations = stationsPerLocation * locs;
      spellenNeeded = stationsPerLocation * locs;
    }
  } else {
    totalStations = matchesPerRound * poolCount;
    spellenNeeded = totalStations;
  }

  const enoughSpellen = spelCount >= spellenNeeded;
  const spelDeficit = Math.max(0, spellenNeeded - spelCount);

  let roundsForAllSpellen: number;
  if (movementPolicy === "blocks" && poolCount > 1) {
    if (stationLayout === "same") {
      roundsForAllSpellen = spelCount;
    } else {
      const spellenOnOneLocation = Math.ceil(spelCount / Math.max(locationCount, 1));
      roundsForAllSpellen = spellenOnOneLocation * Math.max(locationCount, 1);
    }
  } else {
    roundsForAllSpellen = spelCount;
  }
  const spellenExceedRounds = roundsForAllSpellen > roundRobinRounds && enoughSpellen;

  // For single-pool all-spellen: use H rounds (= spelCount) when spellen fit in
  // matchesPerRound, allowing 0 spel-repeats with single-pool-rotation strategy.
  const singlePoolAllSpellen = scheduleMode === "all-spellen"
    && poolCount <= 1
    && spelCount <= matchesPerRound
    && spelCount >= 2
    && groupCount % 2 === 0
    && groupCount >= 4;

  const roundsNeeded = singlePoolAllSpellen
    ? spelCount
    : scheduleMode === "all-spellen" && spellenExceedRounds
      ? roundsForAllSpellen
      : roundRobinRounds;

  const smallestPool = poolSizes?.length
    ? Math.min(...poolSizes)
    : (poolCount > 1 ? Math.floor(groupCount / poolCount) : groupCount);
  const smallestPoolRounds = smallestPool - 1;
  const matchupMaxNeeded = smallestPoolRounds > 0 ? Math.ceil(roundsNeeded / smallestPoolRounds) : 1;

  const breakAfterSlot = (enableBreak ?? true) && roundsNeeded >= 4 ? Math.floor(roundsNeeded / 2) : 0;
  const totalActiveSlots = roundsNeeded;
  const totalSlots = breakAfterSlot > 0 ? totalActiveSlots + 1 : totalActiveSlots;

  return {
    groupsPerPool, roundRobinRounds, matchesPerRound, stationsPerLocation, totalStations,
    spellenNeeded, hasBye, roundsNeeded, totalActiveSlots, breakAfterSlot, totalSlots,
    enoughSpellen, spelDeficit, spellenExceedRounds, matchupMaxNeeded,
  };
}

// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------

export interface ConfigBuilderParams {
  name: string;

  // Pools/Segments
  usePools: boolean;
  poolNames: string[];

  // Groups
  groupCount: number;
  groupNames?: string[];
  /** Per-pool group counts, e.g. [6, 5] for Pool A: 6, Pool B: 5. Sum must equal groupCount. */
  groupsPerPool?: number[];

  // Spellen / Activity Types
  spellen: string[];

  // Locations — accepts either plain names (legacy) or richer objects with metadata.
  locations: Array<string | { name: string; address?: string; lat?: number; lng?: number; phone?: string; website?: string; rating?: number; reviewCount?: number; priceLevel?: string; category?: string; sourceId?: string }>;

  // Movement
  movementPolicy: "free" | "blocks";
  stationLayout: "same" | "split";

  // Schedule
  scheduleMode: ScheduleMode;
  /** Kroegentocht-modus: solo = 1 groep per kroeg, vs = 2 groepen per kroeg. Default 'solo'. */
  mode?: "solo" | "vs";
  startTime: string;
  roundDurationMinutes: number;
  transitionMinutes: number;

  // Constraints
  repeatPolicy: "off" | "soft" | "hard";
  matchupMaxOverride?: number;

  // Station overrides (wizard step 7: user can change locations/capacity)
  stationOverrides?: Array<{ spel: string; location: string; capacity: number }>;

  // Pause activity (Phase 2 — optional)
  pauseActivityName?: string;

  /** Auto-insert pauze-slot halverwege het schema. Default false. */
  enableBreak?: boolean;
}

export interface ConfigBuilderResult {
  config: ConfigV2;
  calc: CalcResult;
}

export function buildConfig(params: ConfigBuilderParams): ConfigBuilderResult {
  // Normalize locations: accept both plain strings and richer objects with metadata.
  const locationInputs = params.locations.map((l) => (typeof l === "string" ? { name: l } : l));
  const locationNames = locationInputs.map((l) => l.name);

  const poolCount = params.usePools ? params.poolNames.length : 1;
  const effectiveMovement = params.usePools ? params.movementPolicy : "free";
  const calc = calculateSchedule(
    params.groupCount, poolCount, params.spellen.length,
    effectiveMovement, locationNames.length, params.scheduleMode, params.stationLayout,
    params.groupsPerPool,
    params.enableBreak ?? true,
  );

  const configId = `cfg-v2-${Date.now()}`;

  // Segments
  const segments = params.usePools
    ? params.poolNames.map((n, i) => ({ id: `pool-${i + 1}`, name: n }))
    : [];

  // Groups — distribute across pools using per-pool counts if provided
  const groups: ConfigV2["groups"] = [];
  if (params.usePools && params.groupsPerPool?.length === segments.length) {
    // Explicit per-pool distribution
    let groupIdx = 0;
    for (let p = 0; p < segments.length; p++) {
      for (let g = 0; g < params.groupsPerPool[p]; g++) {
        groups.push({
          id: `group-${groupIdx + 1}`,
          name: params.groupNames?.[groupIdx] ?? `Groep ${groupIdx + 1}`,
          segmentId: segments[p].id,
        });
        groupIdx++;
      }
    }
  } else {
    // Auto-distribute: ceiling-based
    const segmentCount = segments.length || 1;
    const groupsPerPoolSize = Math.ceil(params.groupCount / segmentCount);
    for (let i = 0; i < params.groupCount; i++) {
      groups.push({
        id: `group-${i + 1}`,
        name: params.groupNames?.[i] ?? `Groep ${i + 1}`,
        ...(params.usePools
          ? { segmentId: segments[Math.floor(i / groupsPerPoolSize) % segments.length].id }
          : {}),
      });
    }
  }

  // Activity types
  const activityTypes = params.spellen.map((s, i) => ({
    id: `activity-${i + 1}`,
    name: s,
    baseId: findSpelByName(s)?.key ?? null,
  }));

  // Locations — preserve metadata from input.
  const locations = locationInputs.map((l, i) => ({ id: `locatie-${i + 1}`, ...l }));

  // Stations
  let stations: ConfigV2["stations"];
  if (params.stationOverrides) {
    // User has manually adjusted station layout
    stations = params.stationOverrides.map((s, i) => ({
      id: `station-${i + 1}`,
      name: s.spel,
      locationId: locations.find((l) => l.name === s.location)?.id ?? locations[0]?.id ?? "",
      activityTypeId: activityTypes.find((a) => a.name === s.spel)?.id ?? activityTypes[0]?.id ?? "",
      capacityGroupsMin: s.capacity,
      capacityGroupsMax: s.capacity,
    }));
  } else {
    // Auto-generate stations from spellen + layout
    const stationDefs: Array<{ spel: string; location: string }> = [];
    if (effectiveMovement === "blocks" && params.usePools && locationNames.length >= 2) {
      if (params.stationLayout === "same") {
        for (const loc of locationNames) {
          for (const spel of params.spellen) {
            stationDefs.push({ spel, location: loc });
          }
        }
      } else {
        // Split: groepeer spellen per locatie (1-5 → veld 1, 6-10 → veld 2)
        const perLoc = Math.ceil(params.spellen.length / locationNames.length);
        for (let i = 0; i < params.spellen.length; i++) {
          stationDefs.push({ spel: params.spellen[i], location: locationNames[Math.floor(i / perLoc)] ?? locationNames[locationNames.length - 1] });
        }
      }
    } else {
      // Free / no pools: groepeer spellen per locatie
      const perLoc = Math.ceil(params.spellen.length / Math.max(locationNames.length, 1));
      for (let i = 0; i < params.spellen.length; i++) {
        stationDefs.push({ spel: params.spellen[i], location: locationNames[Math.floor(i / perLoc)] ?? locationNames[locationNames.length - 1] });
      }
    }

    // Default "vs" voor legacy callers (tests/oudere data) zonder expliciete mode.
    // Nieuwe configs via wizard/createEmpty zetten mode altijd expliciet.
    const cap = params.mode === "solo" ? 1 : 2;
    stations = stationDefs.map((s, i) => ({
      id: `station-${i + 1}`,
      name: s.spel,
      locationId: locations.find((l) => l.name === s.location)?.id ?? locations[0]?.id ?? "",
      activityTypeId: activityTypes.find((a) => a.name === s.spel)?.id ?? activityTypes[0]?.id ?? "",
      capacityGroupsMin: cap,
      capacityGroupsMax: cap,
    }));
  }

  // Timeslots
  const timeslots = createTimeslots(
    params.startTime,
    params.roundDurationMinutes,
    params.transitionMinutes,
    calc.totalSlots,
    calc.breakAfterSlot,
  );

  // Location blocks
  let locationBlocks: ConfigV2["locationBlocks"] = undefined;
  if (params.usePools && params.movementPolicy === "blocks" && locations.length >= 2 && calc.breakAfterSlot > 0) {
    const activeSlots = timeslots.filter((s) => s.kind === "active");
    const breakSlot = timeslots.find((s) => s.kind === "break");
    const breakIdx = breakSlot ? activeSlots.findIndex((s) => s.index > breakSlot.index) : -1;
    if (breakIdx > 0) {
      locationBlocks = [
        {
          id: "block-1", name: "Blok 1",
          timeslotIds: activeSlots.slice(0, breakIdx).map((s) => s.id),
          segmentLocationMap: Object.fromEntries(segments.map((seg, i) => [seg.id, locations[i % locations.length].id])),
        },
        {
          id: "block-2", name: "Blok 2",
          timeslotIds: activeSlots.slice(breakIdx).map((s) => s.id),
          segmentLocationMap: Object.fromEntries(segments.map((seg, i) => [seg.id, locations[(i + 1) % locations.length].id])),
        },
      ];
    }
  }

  // Pause activity: add pause station when pools have odd groups
  let pauseActivity: ConfigV2["pauseActivity"] = undefined;
  if (calc.hasBye && params.pauseActivityName) {
    const pauseActivityId = "activity-pause";
    const pauseStationName = params.pauseActivityName;
    activityTypes.push({ id: pauseActivityId, name: params.pauseActivityName, baseId: null });

    // Add one pause station per location so each pool's bye group has a station
    for (let li = 0; li < locations.length; li++) {
      stations.push({
        id: `station-pause-${li + 1}`,
        name: pauseStationName,
        locationId: locations[li].id,
        activityTypeId: pauseActivityId,
        capacityGroupsMin: 1,
        capacityGroupsMax: 1,
      });
    }
    pauseActivity = { name: params.pauseActivityName };
  }

  const config: ConfigV2 = {
    id: configId,
    name: params.name || "Nieuwe kroegentocht",
    segmentsEnabled: params.usePools,
    segments,
    groups,
    locations,
    activityTypes,
    stations,
    timeslots,
    movementPolicy: effectiveMovement,
    locationBlocks,
    constraints: {
      matchupMaxPerPair: params.matchupMaxOverride ?? calc.matchupMaxNeeded,
      requireSameSegmentForMatches: params.usePools,
      avoidRepeatActivityType: params.repeatPolicy,
    },
    scheduleSettings: {
      roundDurationMinutes: params.roundDurationMinutes,
      transitionMinutes: params.transitionMinutes,
      scheduleMode: params.scheduleMode,
      // Mode wordt alleen meegeschreven als de caller het expliciet zet.
      ...(params.mode ? { mode: params.mode } : {}),
    },
    pauseActivity,
  };

  return { config, calc };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createTimeslots(
  startTime: string,
  roundDurationMinutes: number,
  transitionMinutes: number,
  totalSlots: number,
  breakAfterSlot: number,
): TimeslotV2[] {
  const [hRaw, mRaw] = startTime.split(":");
  const base = new Date(Date.UTC(2026, 0, 1, Number(hRaw) || 9, Number(mRaw) || 0, 0, 0));
  let cursor = new Date(base);
  const fmt = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

  const slots: TimeslotV2[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const slotNum = i + 1;
    const isBreak = breakAfterSlot > 0 && slotNum === breakAfterSlot + 1;
    const start = new Date(cursor);
    const end = new Date(start.getTime() + roundDurationMinutes * 60_000);
    slots.push({
      id: `slot-${slotNum}`,
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${fmt(start)} - ${fmt(end)}`,
      kind: isBreak ? "break" : "active",
      index: slotNum,
    });
    if (i < totalSlots - 1) {
      cursor = new Date(end.getTime() + transitionMinutes * 60_000);
    }
  }
  return slots;
}
