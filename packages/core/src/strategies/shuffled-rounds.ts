/**
 * Shuffled-rounds strategie — gerichte ronde-permutaties binnen
 * locatieblokken om spel-herhalingen te verminderen.
 *
 * Het probleem: `round-robin-exact` werkt op één vaste rondevolgorde.
 * Sub-blokken worden sequentieel-greedy gevuld, waardoor sub-blok 2
 * vastzit aan de keuzes van sub-blok 1. Door de rondes binnen een blok
 * anders te ordenen kan de DFS-toewijzing een betere oplossing vinden.
 *
 * Aanpak: voor elke permutatie van de rondes binnen het grootste blok,
 * probeer `assignToStations(mode: "blockExact")` en houd het resultaat
 * met de minste spel-herhalingen bij. Stop zodra 0 herhalingen zijn
 * bereikt — verder zoeken heeft geen zin.
 *
 * Zie `docs/generator-fase-2-plan.md` stap 2.1.
 */

import type { ConfigV2, Id, RoundRobinRound } from "../model";
import type { FeasibilityReport } from "../feasibility";
import type { GeneratePlanOptions } from "../generator";
import {
  generateRoundRobin,
  groupIdsBySegment,
  assignToStations,
  totalRepeatPenalty,
} from "../generator";
import type { PlanAttempt, PlanStrategy } from "./index";

// ---------------------------------------------------------------------------
// Permutation helpers
// ---------------------------------------------------------------------------

/**
 * Genereer alle permutaties van indices [0..n-1]. Voor n <= 8 is dit
 * beheersbaar (8! = 40320). Voor grotere n beperken we tot de eerste
 * `maxPermutations` via een cutoff.
 */
function* permutations(n: number, maxPermutations = 5040): Generator<number[]> {
  const indices = Array.from({ length: n }, (_, i) => i);
  let count = 0;

  function* heap(k: number): Generator<number[]> {
    if (count >= maxPermutations) return;
    if (k === 1) {
      yield [...indices];
      count++;
      return;
    }
    for (let i = 0; i < k; i++) {
      yield* heap(k - 1);
      if (count >= maxPermutations) return;
      if (k % 2 === 0) {
        [indices[i], indices[k - 1]] = [indices[k - 1], indices[i]];
      } else {
        [indices[0], indices[k - 1]] = [indices[k - 1], indices[0]];
      }
    }
  }

  yield* heap(n);
}

function applyPermutation<T>(arr: T[], perm: number[]): T[] {
  return perm.map((i) => arr[i]);
}

// ---------------------------------------------------------------------------
// Blok-analyse: welke rondes zitten in welk blok?
// ---------------------------------------------------------------------------

interface BlockInfo {
  blockId: Id;
  timeslotIds: Id[];
  roundIndices: number[]; // indices in de ronde-array
}

function analyzeBlocks(config: ConfigV2): BlockInfo[] {
  const activeTimeslots = [...config.timeslots]
    .filter((ts) => ts.kind === "active")
    .sort((a, b) => a.index - b.index);
  const activeSlotIds = activeTimeslots.map((ts) => ts.id);

  const blocks = config.locationBlocks ?? [];
  if (blocks.length === 0) return [];

  return blocks.map((block) => {
    const roundIndices = block.timeslotIds
      .map((tsId) => activeSlotIds.indexOf(tsId))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    return {
      blockId: block.id,
      timeslotIds: block.timeslotIds,
      roundIndices,
    };
  });
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export const shuffledRoundsStrategy: PlanStrategy = {
  name: "shuffled-rounds",

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

    // Genereer de basis round-robin per segment
    const baseRoundsBySegment = new Map(
      [...bySegment.entries()].map(([segmentId, groupIds]) => [
        segmentId,
        generateRoundRobin(groupIds, activeSlotCount),
      ])
    );

    // Analyseer blokstructuur
    const blockInfos = analyzeBlocks(config);
    if (blockInfos.length === 0) return null;

    // Permuteren we elk blok dat > 1 ronde bevat. We kiezen het blok
    // met de meeste rondes als target. Permuteren van meerdere blokken
    // tegelijk zou een combinatorische explosie geven; één blok per keer
    // is voldoende om de DFS-startpositie te variëren.
    const targetBlock = blockInfos.reduce((a, b) =>
      b.roundIndices.length > a.roundIndices.length ? b : a
    );

    if (targetBlock.roundIndices.length <= 1) {
      // Val terug op de standaard block-exact toewijzing
      const result = assignToStations(config, baseRoundsBySegment, {
        ...options?.assignment,
        mode: "blockExact",
      });
      return {
        plan: result.plan,
        byesByTimeslot: result.byesByTimeslot,
        strategyName: this.name,
      };
    }

    let bestPlan: PlanAttempt | null = null;
    let bestRepeats = Infinity;
    let sinceLastImprovement = 0;
    // Stop na 10 achtereenvolgende permutaties zonder verbetering — als
    // de DFS dezelfde repeat-count geeft ongeacht volgorde, is verder
    // permuteren nutteloos. Dit is geen kunstmatige limiet maar een
    // convergentie-criterium.
    const maxWithoutImprovement = 10;

    for (const perm of permutations(targetBlock.roundIndices.length)) {
      // Bouw een gepermuteerde ronde-map: wissel de rondes op de posities
      // van het target-blok.
      const permutedRoundsBySegment = new Map<Id, RoundRobinRound[]>();

      for (const [segmentId, rounds] of baseRoundsBySegment) {
        const permuted = [...rounds];
        const blockRounds = targetBlock.roundIndices.map((i) => rounds[i]);
        const shuffledBlockRounds = applyPermutation(blockRounds, perm);
        for (let j = 0; j < targetBlock.roundIndices.length; j++) {
          permuted[targetBlock.roundIndices[j]] = shuffledBlockRounds[j];
        }
        permutedRoundsBySegment.set(segmentId, permuted);
      }

      try {
        const result = assignToStations(config, permutedRoundsBySegment, {
          ...options?.assignment,
          mode: "blockExact",
        });

        const repeats = totalRepeatPenalty(result.plan, config);

        if (repeats < bestRepeats) {
          bestRepeats = repeats;
          sinceLastImprovement = 0;
          bestPlan = {
            plan: result.plan,
            byesByTimeslot: result.byesByTimeslot,
            strategyName: this.name,
          };

          // Stop zodra we 0 herhalingen bereiken — het wiskundige minimum
          // is gehaald, verder zoeken heeft geen zin.
          if (repeats === 0) break;
        } else {
          sinceLastImprovement++;
          if (sinceLastImprovement >= maxWithoutImprovement) break;
        }
      } catch {
        sinceLastImprovement++;
        if (sinceLastImprovement >= maxWithoutImprovement) break;
        continue;
      }
    }

    return bestPlan;
  },
};
