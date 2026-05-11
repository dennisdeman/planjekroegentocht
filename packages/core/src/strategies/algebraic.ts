/**
 * Algebraïsche strategie — dunne wrapper rond `tryAlgebraicPlan`.
 *
 * Levert een 0-spel-repeat rooster via modulaire arithmetiek. Werkt
 * alleen voor blocks-modus met even pools waar H = groupCount/2 een
 * "nice H" waarde is (3, 5, 7, 9, 11, ...). Zie `constructPerfectBlock`
 * in `generator.ts` voor de wiskunde.
 *
 * De `applicable` check delegeert naar `feasibility.algebraicFeasible` —
 * dezelfde voorwaarde die `hasAlgebraicK` test — zodat de beslissing op
 * precies één plek leeft.
 */

import type { ConfigV2 } from "../model";
import type { FeasibilityReport } from "../feasibility";
import { tryAlgebraicPlan } from "../generator";
import type { PlanAttempt, PlanStrategy } from "./index";

export const algebraicStrategy: PlanStrategy = {
  name: "algebraic",

  applicable(_config: ConfigV2, feasibility: FeasibilityReport): boolean {
    // De strategie is toepasbaar als er minstens één segment is waarvoor
    // de algebraïsche constructie werkt. In de praktijk moeten *alle*
    // segmenten algebraic-feasible zijn, want `tryAlgebraicPlan` bouwt
    // het complete plan of geeft null. Daarom: alle segmenten moeten
    // algebraicFeasible zijn.
    if (feasibility.segments.length === 0) return false;
    return feasibility.segments.every((seg) => seg.algebraicFeasible);
  },

  generate(config: ConfigV2): PlanAttempt | null {
    const result = tryAlgebraicPlan(config);
    if (!result) return null;
    return {
      plan: result.plan,
      byesByTimeslot: result.byesByTimeslot,
      strategyName: this.name,
    };
  },
};
