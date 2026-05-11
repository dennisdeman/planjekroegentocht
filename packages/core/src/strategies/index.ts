/**
 * Strategie-registry — `generateBestPlan` (stap 1.5) roept alle `applicable`
 * strategieën aan, laat ze elk een plan produceren, en kiest de beste op
 * `computePlanScore`. Strategieën doen zelf geen scoring — dat is de
 * verantwoordelijkheid van de orchestrator.
 *
 * Nieuwe strategieën worden in fase 2+ aan `STRATEGY_REGISTRY` toegevoegd
 * zonder kernwijzigingen.
 *
 * Zie `docs/generator-design.md` §2.3 voor het volledige ontwerp.
 */

import type { ConfigV2, Id, PlanV2 } from "../model";
import type { FeasibilityReport } from "../feasibility";
import type { GeneratePlanOptions } from "../generator";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlanAttempt {
  plan: PlanV2;
  byesByTimeslot: Record<Id, Id[]>;
  strategyName: string;
  /**
   * Als de strategie een gewijzigde config gebruikt (bv. bye-assisted
   * voegt een extra timeslot toe), dan moet de scoring tegen die config
   * draaien — niet tegen de originele. Optioneel; als undefined, wordt
   * de originele config van `generateBestPlan` gebruikt.
   */
  scoringConfig?: ConfigV2;
}

export interface PlanStrategy {
  readonly name: string;
  /**
   * Kan deze strategie een plan produceren voor deze configuratie?
   * Wordt aangeroepen vóór `generate`. `false` betekent "sla over", niet
   * "fout".
   */
  applicable(config: ConfigV2, feasibility: FeasibilityReport): boolean;
  /**
   * Produceer een plan. Retourneert `null` als de strategie toch geen
   * oplossing vindt (bv. DFS-budget op). Mag `NoSolutionError` gooien
   * als het bewijs is dat er géén oplossing bestaat — de orchestrator
   * vangt dat op.
   */
  generate(
    config: ConfigV2,
    feasibility: FeasibilityReport,
    options?: GeneratePlanOptions
  ): PlanAttempt | null;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

import { algebraicStrategy } from "./algebraic";
import { pairedRotationStrategy } from "./paired-rotation";
import { singlePoolRotationStrategy } from "./single-pool-rotation";
import { roundRobinExactStrategy } from "./round-robin-exact";
import { roundRobinSlotStrategy } from "./round-robin-slot";
import { shuffledRoundsStrategy } from "./shuffled-rounds";

export { algebraicStrategy } from "./algebraic";
export { pairedRotationStrategy } from "./paired-rotation";
export { singlePoolRotationStrategy } from "./single-pool-rotation";
// bye-assisted is bewust NIET in de registry — zie docs/generator-fase-2-bye-beslissing.md.
// De strategie werkt (16g/8s: 10→4 repeats, 16g/10s: 2→0), maar verandert
// de config structureel (+1 timeslot, +ghost groups, +pause stations) wat
// incompatibel is met de bestaande plan/config-relatie. Het idee leeft voort
// als voorstel in proposeAlternatives (fase 3, Pad B).
export { byeAssistedStrategy } from "./bye-assisted";
export { roundRobinExactStrategy } from "./round-robin-exact";
export { roundRobinSlotStrategy } from "./round-robin-slot";
export { shuffledRoundsStrategy } from "./shuffled-rounds";

/**
 * Geordend van "meest specifiek / verwacht hoogste kwaliteit" naar "meest
 * generiek / altijd-fallback". In stap 1.5 probeert `generateBestPlan` ze
 * allemaal en kiest op score — volgorde bepaalt niet wie wint, maar kan
 * wel invloed hebben op welke als eerste klaar is bij een tijdsbudget.
 */
export const STRATEGY_REGISTRY: PlanStrategy[] = [
  algebraicStrategy,
  pairedRotationStrategy,
  singlePoolRotationStrategy,
  shuffledRoundsStrategy,
  roundRobinExactStrategy,
  roundRobinSlotStrategy,
];
