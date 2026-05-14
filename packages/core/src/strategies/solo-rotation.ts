/**
 * Solo-rotation strategie — voor kroegentochten in "solo"-modus.
 *
 * Elke groep loopt alleen, dus elke station-slot heeft maximaal 1 groep.
 * Algoritme: cyclische rotatie zodat elke groep over de rondes verschillende
 * kroegen bezoekt. Bij N groepen ≤ M stations krijgt elke groep elke ronde
 * een station; bij N > M roteert er per ronde een groep op bye.
 *
 * Triggert alleen als `scheduleSettings.mode === "solo"` — wordt overgeslagen
 * voor klassieke Vs-modus (waarvoor de bestaande strategies werken).
 */

import type { ConfigV2, Id, PlanV2 } from "../model";
import type { FeasibilityReport } from "../feasibility";
import type { PlanAttempt, PlanStrategy } from "./index";

function nowIso(): string {
  return new Date().toISOString();
}

function groupIdsBySegmentLocal(config: ConfigV2): Map<Id, Id[]> {
  const m = new Map<Id, Id[]>();
  for (const g of config.groups) {
    const segId = g.segmentId ?? "default";
    const arr = m.get(segId) ?? [];
    arr.push(g.id);
    m.set(segId, arr);
  }
  return m;
}

export const soloRotationStrategy: PlanStrategy = {
  name: "solo-rotation",

  applicable(config: ConfigV2, _feasibility: FeasibilityReport): boolean {
    return config.scheduleSettings.mode === "solo";
  },

  generate(config: ConfigV2): PlanAttempt | null {
    const activeTimeslots = [...config.timeslots]
      .filter((t) => t.kind === "active")
      .sort((a, b) => a.index - b.index);

    // Filter pause-stations: solo betekent één spel per kroeg, geen pause-station nodig.
    const stations = config.stations
      .filter((s) => s.activityTypeId !== "activity-pause")
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));

    if (stations.length === 0 || activeTimeslots.length === 0) return null;

    const allocations: PlanV2["allocations"] = [];
    const byesByTimeslot: Record<Id, Id[]> = {};
    for (const ts of config.timeslots) byesByTimeslot[ts.id] = [];

    const bySegment = groupIdsBySegmentLocal(config);
    const segmentIds = config.segments.length > 0 ? config.segments.map((s) => s.id) : ["default"];

    for (const segmentId of segmentIds) {
      const groupIds = (bySegment.get(segmentId) ?? []).slice().sort();
      if (groupIds.length === 0) continue;

      // Stations beschikbaar voor dit segment (alle stations voor solo; pools/segmentation kan later).
      const segStations = stations;
      const M = segStations.length;
      const N = groupIds.length;

      for (let ri = 0; ri < activeTimeslots.length; ri++) {
        const timeslot = activeTimeslots[ri];
        // Cyclische rotatie: groep i komt in ronde r bij station ((i + r) mod M).
        // Bij N > M roteert er ook een bye-vinger zodat over de rondes andere groepen rusten.
        const offsetForBye = ri % Math.max(1, N);
        for (let gi = 0; gi < N; gi++) {
          const cyclicGi = (gi + offsetForBye) % N;
          if (cyclicGi >= M) {
            // Bye voor deze groep in deze ronde.
            byesByTimeslot[timeslot.id].push(groupIds[gi]);
            continue;
          }
          const stationIdx = (gi + ri) % M;
          allocations.push({
            id: `alloc-solo-${allocations.length + 1}`,
            timeslotId: timeslot.id,
            stationId: segStations[stationIdx].id,
            groupIds: [groupIds[gi]],
          });
        }
      }
    }

    if (allocations.length === 0) return null;

    return {
      plan: {
        id: `plan-${Date.now()}`,
        configId: config.id,
        allocations,
        version: 1,
        updatedAt: nowIso(),
      },
      byesByTimeslot,
      strategyName: "solo-rotation",
    };
  },
};
