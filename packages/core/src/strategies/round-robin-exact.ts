/**
 * Round-robin exact-blocks strategie — dunne wrapper rond het
 * `assignToStationsByExactBlocks` pad.
 *
 * Genereert round-robin matches per segment en wijst stations toe via
 * blok-DFS, waarbij meerdere rondes binnen hetzelfde locatieblok als
 * geheel worden geoptimaliseerd. Geschikt voor configuraties met
 * `movementPolicy === "blocks"` en daadwerkelijke `locationBlocks`.
 *
 * Dit is de default-strategie voor block-based kroegentochten.
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

export const roundRobinExactStrategy: PlanStrategy = {
  name: "round-robin-exact",

  applicable(config: ConfigV2, _feasibility: FeasibilityReport): boolean {
    return (
      config.movementPolicy === "blocks" &&
      (config.locationBlocks ?? []).length > 0
    );
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
      mode: "blockExact",
    });

    return {
      plan: result.plan,
      byesByTimeslot: result.byesByTimeslot,
      strategyName: this.name,
    };
  },
};
