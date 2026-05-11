/**
 * Bye-assisted strategie — voegt een virtueel extra timeslot toe en maakt
 * pools oneven met een ghost-groep, zodat elke ronde een natuurlijke bye
 * heeft. De bye-groep belandt op een pauze-station, waardoor de
 * spel-herhaling die die groep in die ronde zou hebben gehad, verdwijnt.
 *
 * Mechanisme:
 * 1. Kloon de config
 * 2. Voeg 1 extra actief timeslot toe (uitbreiding van het laatste blok)
 * 3. Voeg een ghost-groep per pool toe → pools worden oneven
 * 4. Zorg dat pauseActivity + pauze-stations bestaan
 * 5. Genereer round-robin (oneven → natuurlijke byes)
 * 6. Filter ghost uit matches, promoveer ghost's tegenstander naar bye
 * 7. Draai assignToStations op de uitgebreide config
 * 8. Strip ghost-allocaties uit het resultaat
 *
 * Het resulterende plan heeft 1 extra ronde t.o.v. de originele config.
 * Dit wordt eerlijk gerapporteerd — de gebruiker moet akkoord gaan met
 * een langer programma.
 *
 * Zie `docs/generator-fase-2-plan.md` stap 2.3.
 */

import type { ConfigV2, Id, RoundRobinRound } from "../model";
import type { FeasibilityReport } from "../feasibility";
import type { GeneratePlanOptions } from "../generator";
import {
  generateRoundRobin,
  groupIdsBySegment,
  assignToStations,
} from "../generator";
import type { PlanAttempt, PlanStrategy } from "./index";

const GHOST_PREFIX = "__bye_ghost__";

function isGhost(id: Id): boolean {
  return id.startsWith(GHOST_PREFIX);
}

function buildByeAssistedConfig(config: ConfigV2): ConfigV2 {
  // Deep clone relevant arrays
  const clone: ConfigV2 = {
    ...config,
    groups: config.groups.map((g) => ({ ...g })),
    segments: config.segments.map((s) => ({ ...s })),
    timeslots: config.timeslots.map((t) => ({ ...t })),
    locations: config.locations.map((l) => ({ ...l })),
    activityTypes: config.activityTypes.map((a) => ({ ...a })),
    stations: config.stations.map((s) => ({ ...s })),
    locationBlocks: (config.locationBlocks ?? []).map((b) => ({
      ...b,
      timeslotIds: [...b.timeslotIds],
      segmentLocationMap: { ...b.segmentLocationMap },
    })),
    constraints: { ...config.constraints },
    scheduleSettings: { ...config.scheduleSettings },
  };

  // 1. Voeg 1 extra actief timeslot toe
  const activeSlots = clone.timeslots
    .filter((s) => s.kind === "active")
    .sort((a, b) => a.index - b.index);
  const lastActive = activeSlots[activeSlots.length - 1];
  const newSlotId = "bye-extra-slot";
  clone.timeslots.push({
    id: newSlotId,
    start: lastActive.end,
    end: lastActive.end,
    label: "Extra (bye-assisted)",
    kind: "active",
    index: lastActive.index + 1,
  });

  // Wijs het nieuwe slot toe aan het laatste blok
  const blocks = clone.locationBlocks ?? [];
  if (blocks.length > 0) {
    blocks[blocks.length - 1].timeslotIds.push(newSlotId);
  }

  // 2. Ghost-groep per pool
  const segmentIds = clone.segmentsEnabled
    ? clone.segments.map((s) => s.id)
    : ["__default__"];
  for (const segId of segmentIds) {
    clone.groups.push({
      id: `${GHOST_PREFIX}${segId}`,
      name: `Ghost ${segId}`,
      ...(clone.segmentsEnabled ? { segmentId: segId } : {}),
    });
  }

  // 3. Zorg dat pauseActivity + pauze-stations bestaan
  if (!clone.pauseActivity) {
    clone.pauseActivity = { name: "Pauze (bye-assisted)" };
    const pauseActivityId = "activity-pause";
    if (!clone.activityTypes.some((a) => a.id === pauseActivityId)) {
      clone.activityTypes.push({ id: pauseActivityId, name: "Pauze" });
    }
    for (const loc of clone.locations) {
      const existing = clone.stations.find(
        (s) =>
          s.activityTypeId === pauseActivityId && s.locationId === loc.id
      );
      if (!existing) {
        clone.stations.push({
          id: `station-pause-bye-${loc.id}`,
          name: "Pauze",
          locationId: loc.id,
          activityTypeId: pauseActivityId,
          capacityGroupsMin: 1,
          capacityGroupsMax: 1,
        });
      }
    }
  }

  // Verhoog matchupMaxPerPair — met een extra ronde kunnen matchups toenemen
  clone.constraints = {
    ...clone.constraints,
    matchupMaxPerPair: Math.max(
      clone.constraints.matchupMaxPerPair,
      Math.ceil(
        (activeSlots.length + 1) /
          Math.max(
            1,
            (clone.groups.length / Math.max(segmentIds.length, 1)) - 1
          )
      )
    ),
  };

  return clone;
}

function stripGhosts(
  rounds: RoundRobinRound[]
): RoundRobinRound[] {
  return rounds.map((round) => {
    const ghostMatches = round.matches.filter(
      ([a, b]) => isGhost(a) || isGhost(b)
    );
    const realByesFromGhost = ghostMatches.flatMap(([a, b]) =>
      [a, b].filter((g) => !isGhost(g))
    );

    const realMatches = round.matches.filter(
      ([a, b]) => !isGhost(a) && !isGhost(b)
    );

    let bye = round.bye;
    if (bye && isGhost(bye)) bye = undefined;
    if (!bye && realByesFromGhost.length > 0) bye = realByesFromGhost[0];

    return {
      matches: realMatches,
      bye,
    };
  });
}

export const byeAssistedStrategy: PlanStrategy = {
  name: "bye-assisted",

  applicable(config: ConfigV2, feasibility: FeasibilityReport): boolean {
    // Actief voor even pools waar de algebraïsche constructie niet werkt
    // en er meer dan 0 wedstrijden zijn.
    if (feasibility.segments.length === 0) return false;
    return feasibility.segments.some(
      (seg) =>
        !seg.algebraicFeasible &&
        seg.groupCount >= 4 &&
        seg.groupCount % 2 === 0 &&
        seg.matchesPerGroup > 0
    );
  },

  generate(
    config: ConfigV2,
    _feasibility: FeasibilityReport,
    options?: GeneratePlanOptions
  ): PlanAttempt | null {
    const expandedConfig = buildByeAssistedConfig(config);

    const bySegment = groupIdsBySegment(expandedConfig);
    const activeSlotCount = expandedConfig.timeslots.filter(
      (s) => s.kind === "active"
    ).length;

    const roundsBySegment = new Map<Id, RoundRobinRound[]>();
    for (const [segmentId, groupIds] of bySegment.entries()) {
      const rounds = generateRoundRobin(groupIds, activeSlotCount);
      roundsBySegment.set(segmentId, stripGhosts(rounds));
    }

    try {
      const result = assignToStations(expandedConfig, roundsBySegment, {
        ...options?.assignment,
        mode:
          expandedConfig.movementPolicy === "blocks" ? "blockExact" : "slot",
      });

      // Strip ghost-groep allocaties uit het plan
      result.plan.allocations = result.plan.allocations.filter(
        (a) => !a.groupIds.some(isGhost)
      );

      // Strip ghost byes
      for (const tsId of Object.keys(result.byesByTimeslot)) {
        result.byesByTimeslot[tsId] = result.byesByTimeslot[tsId].filter(
          (g) => !isGhost(g)
        );
      }

      // Het plan gebruikt de expandedConfig (met extra slot). We retourneren
      // het plan as-is — de extra ronde zit erin. De orchestrator in
      // generateBestPlan scoort het plan met de originele config, wat
      // betekent dat allocaties in het extra slot gewoon meetellen.
      // De gebruiker ziet het verschil: 8 rondes i.p.v. 7.

      return {
        plan: result.plan,
        byesByTimeslot: result.byesByTimeslot,
        strategyName: this.name,
        scoringConfig: expandedConfig,
      };
    } catch {
      return null;
    }
  },
};
