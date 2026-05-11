/**
 * Round-robin slot strategie — dunne wrapper rond het
 * `assignToStationsBySlot` pad.
 *
 * Genereert round-robin matches per segment en wijst stations per-slot
 * toe via greedy DFS. Geschikt voor alle configuraties; dit is de
 * universele fallback als geen andere strategie van toepassing is.
 */

import type { ConfigV2 } from "../model";
import type { FeasibilityReport } from "../feasibility";
import type { GeneratePlanOptions } from "../generator";
import {
  generateRoundRobin,
  groupIdsBySegment,
  assignToStations,
  applyRoundOrderShuffles,
} from "../generator";
import type { PlanAttempt, PlanStrategy } from "./index";

export const roundRobinSlotStrategy: PlanStrategy = {
  name: "round-robin-slot",

  applicable(_config: ConfigV2, _feasibility: FeasibilityReport): boolean {
    // Altijd toepasbaar — universele fallback.
    return true;
  },

  generate(
    config: ConfigV2,
    _feasibility: FeasibilityReport,
    options?: GeneratePlanOptions
  ): PlanAttempt | null {
    const bySegment = groupIdsBySegment(config);
    const activeSlotCount = config.timeslots.filter(
      (s) => s.kind === "active"
    ).length;

    const roundsBySegment = new Map(
      [...bySegment.entries()].map(([segmentId, groupIds]) => [
        segmentId,
        generateRoundRobin(groupIds, activeSlotCount),
      ])
    );

    const shuffled = applyRoundOrderShuffles(config, roundsBySegment, options ?? {});

    const result = assignToStations(config, shuffled, {
      ...options?.assignment,
      mode: "slot",
    });

    return {
      plan: result.plan,
      byesByTimeslot: result.byesByTimeslot,
      strategyName: this.name,
    };
  },
};
