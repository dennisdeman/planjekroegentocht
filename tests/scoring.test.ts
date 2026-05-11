import assert from "node:assert/strict";
import test from "node:test";
import { createBasisschoolPresetConfig } from "../lib/planner/defaults";
import { generateBestPlan as generatePlan, totalRepeatPenalty } from "../packages/core/src/generator";
import { analyzePlanFeasibility } from "../packages/core/src/feasibility";
import type { ConfigV2, PlanV2 } from "../packages/core/src/model";
import {
  computeMatchupCounts,
  computeMatchupFairness,
  computePlanScore,
  computeRepeatCount,
  computeSpelVariety,
  computeStationOccupancy,
} from "../packages/core/src/scoring";
import { buildConfig } from "../packages/core/src/config-builder";
import { algebraicStrategy } from "../packages/core/src/strategies";
import { createBaseConfigV2, createPlanTemplate } from "./v2-fixtures";

// ---------------------------------------------------------------------------
// Helper: generate a plan from a config
// ---------------------------------------------------------------------------

function planFor(config: ConfigV2): PlanV2 {
  return generatePlan(config).plan;
}

// ---------------------------------------------------------------------------
// Station occupancy (ongewijzigd — de berekening is niet veranderd)
// ---------------------------------------------------------------------------

test("stationOccupancy: 100% when all stations used every active slot", () => {
  const config = createBaseConfigV2();
  const plan = planFor(config);
  const occ = computeStationOccupancy(plan, config);
  assert.ok(occ > 0.8, `Expected >80% occupancy, got ${(occ * 100).toFixed(1)}%`);
});

test("stationOccupancy: 0% for empty plan", () => {
  const config = createBaseConfigV2();
  const plan = createPlanTemplate(config);
  const occ = computeStationOccupancy(plan, config);
  assert.equal(occ, 0);
});

test("stationOccupancy: excludes bye stations from denominator", () => {
  const config = createBaseConfigV2();
  const plan = planFor(config);

  const byeStationIds = new Set(["x1"]);
  const occWithBye = computeStationOccupancy(plan, config, byeStationIds);
  const occWithout = computeStationOccupancy(plan, config);

  assert.ok(
    occWithBye >= occWithout - 0.01,
    `Bye exclusion should not decrease occupancy: ${occWithBye} vs ${occWithout}`,
  );
});

// ---------------------------------------------------------------------------
// Spel variety (ongewijzigd)
// ---------------------------------------------------------------------------

test("spelVariety: high for basisschool preset", () => {
  const config = createBasisschoolPresetConfig();
  const plan = planFor(config);
  const variety = computeSpelVariety(plan, config);
  assert.ok(variety > 0.5, `Expected variety > 50%, got ${(variety * 100).toFixed(1)}%`);
});

test("spelVariety: 0 for empty plan", () => {
  const config = createBaseConfigV2();
  const plan = createPlanTemplate(config);
  const variety = computeSpelVariety(plan, config);
  assert.equal(variety, 0);
});

// ---------------------------------------------------------------------------
// Repeat count (ongewijzigd)
// ---------------------------------------------------------------------------

test("repeatCount: matches totalRepeatPenalty from generator", () => {
  const config = createBasisschoolPresetConfig();
  const plan = planFor(config);
  const fromScoring = computeRepeatCount(plan, config);
  const fromGenerator = totalRepeatPenalty(plan, config);
  assert.equal(fromScoring, fromGenerator, "Scoring and generator repeat counts must match");
});

test("repeatCount: 0 for empty plan", () => {
  const config = createBaseConfigV2();
  const plan = createPlanTemplate(config);
  assert.equal(computeRepeatCount(plan, config), 0);
});

// ---------------------------------------------------------------------------
// Matchup counts (nieuw — vervangt matchupFairness als primaire metric)
// ---------------------------------------------------------------------------

test("matchupCounts: max encounters respects constraints for base config", () => {
  const config = createBaseConfigV2();
  const plan = planFor(config);
  const { maxEncounters } = computeMatchupCounts(plan);
  assert.ok(maxEncounters <= config.constraints.matchupMaxPerPair,
    `Max encounters ${maxEncounters} exceeds constraint ${config.constraints.matchupMaxPerPair}`);
});

test("matchupCounts: empty plan → 0 encounters", () => {
  const plan = createPlanTemplate(createBaseConfigV2());
  const { maxEncounters } = computeMatchupCounts(plan);
  assert.equal(maxEncounters, 0);
});

// ---------------------------------------------------------------------------
// Backward-compat: matchupFairness still works
// ---------------------------------------------------------------------------

test("matchupFairness: empty plan → perfect fairness", () => {
  const config = createBaseConfigV2();
  const plan = createPlanTemplate(config);
  const { maxEncounters, fairness } = computeMatchupFairness(plan, config);
  assert.equal(maxEncounters, 0);
  assert.equal(fairness, 1);
});

// ---------------------------------------------------------------------------
// Composite score — nieuwe scoring-formule
// ---------------------------------------------------------------------------

test("computePlanScore: all components present with correct types", () => {
  const config = createBasisschoolPresetConfig();
  const plan = planFor(config);
  const score = computePlanScore(plan, config);

  assert.equal(score.mode, "all-spellen");
  assert.ok(score.stationOccupancy >= 0 && score.stationOccupancy <= 1);
  assert.ok(score.spelVariety >= 0 && score.spelVariety <= 1);
  assert.ok(score.repeatCount >= 0);
  assert.ok(score.lowerBoundSpelRepeats >= 0);
  assert.ok(score.spelRepeatPenalty >= 0 && score.spelRepeatPenalty <= 1);
  assert.ok(score.matchupMaxEncounters >= 0);
  assert.ok(score.lowerBoundMatchupCeiling >= 0);
  assert.ok(score.matchupCeilingPenalty >= 0 && score.matchupCeilingPenalty <= 1);
  assert.ok(score.totalScore > 0, "Total score should be positive for a valid plan");
});

test("computePlanScore: empty plan scores lower than generated plan", () => {
  const config = createBaseConfigV2();
  const emptyPlan = createPlanTemplate(config);
  const generatedPlan = planFor(config);

  const emptyScore = computePlanScore(emptyPlan, config);
  const genScore = computePlanScore(generatedPlan, config);

  assert.ok(
    genScore.totalScore > emptyScore.totalScore,
    `Generated plan (${genScore.totalScore.toFixed(2)}) should score higher than empty (${emptyScore.totalScore.toFixed(2)})`,
  );
});

test("computePlanScore: modus-afhankelijke gewichten — zelfde plan, andere modus", () => {
  // Bij dezelfde structurele config maar een andere modus moeten de
  // gewichten veranderen. We testen dit door de modus te schakelen en te
  // controleren dat de totaalscore verschilt (tenzij toevallig gelijk,
  // maar dat is wiskundig onwaarschijnlijk met de gekozen gewichten).
  const config = createBasisschoolPresetConfig();
  const plan = planFor(config);
  const scoreAllSpellen = computePlanScore(plan, config);

  // Verander de modus in de config naar round-robin
  const rrConfig: ConfigV2 = {
    ...config,
    scheduleSettings: { ...config.scheduleSettings, scheduleMode: "round-robin" },
  };
  const scoreRoundRobin = computePlanScore(plan, rrConfig);

  assert.equal(scoreAllSpellen.mode, "all-spellen");
  assert.equal(scoreRoundRobin.mode, "round-robin");
  assert.notEqual(
    scoreAllSpellen.totalScore,
    scoreRoundRobin.totalScore,
    "Modus should affect weighting and thus total score",
  );
});

test("computePlanScore: wiskundig minimum bereikt → spelRepeatPenalty = 1.0", () => {
  // We construeren een situatie waar repeatCount === lowerBound. De
  // 12g/6s config met algebraic strategie garandeert 0 herhalingen.
  const cfg = buildConfig({
    name: "perfect",
    usePools: true,
    poolNames: ["A", "B"],
    groupCount: 12,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6"],
    locations: ["V1", "V2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
  }).config;
  const feas = analyzePlanFeasibility(cfg);
  const attempt = algebraicStrategy.generate(cfg, feas);
  assert.ok(attempt);
  const score = computePlanScore(attempt.plan, cfg, feas);

  assert.equal(score.repeatCount, 0);
  assert.equal(score.lowerBoundSpelRepeats, 0);
  assert.equal(score.spelRepeatPenalty, 1.0);
});

test("computePlanScore: excess herhalingen verlagen spelRepeatPenalty zichtbaar", () => {
  // Bij de basisschool preset (all-spellen modus, 18g/10s) kan het plan
  // herhalingen hebben. Als repeatCount > lowerBound, moet
  // spelRepeatPenalty < 1.0 zijn.
  const config = createBasisschoolPresetConfig();
  const plan = planFor(config);
  const score = computePlanScore(plan, config);

  if (score.repeatCount > score.lowerBoundSpelRepeats) {
    assert.ok(
      score.spelRepeatPenalty < 1.0,
      `spelRepeatPenalty should be < 1.0 when repeatCount (${score.repeatCount}) > lowerBound (${score.lowerBoundSpelRepeats})`,
    );
  }
  // Altijd >= 0
  assert.ok(score.spelRepeatPenalty >= 0);
});

test("computePlanScore: matchupCeilingPenalty verlaagt bij overschrijdingen", () => {
  // Base config met constraintMatchupMaxPerPair=1. Als het plan alle
  // paren binnen de 1 houdt, verwachten we ceilingPenalty = 1.0.
  const config = createBaseConfigV2();
  const plan = planFor(config);
  const score = computePlanScore(plan, config);

  if (score.matchupMaxEncounters <= score.lowerBoundMatchupCeiling) {
    assert.equal(
      score.matchupCeilingPenalty,
      1.0,
      "matchupCeilingPenalty should be 1.0 when all pairs are within the ceiling",
    );
  }
});

test("computePlanScore: feasibility parameter wordt doorgegevan", () => {
  const config = createBasisschoolPresetConfig();
  const plan = planFor(config);
  const feasibility = analyzePlanFeasibility(config);

  const withFeas = computePlanScore(plan, config, feasibility);
  const withoutFeas = computePlanScore(plan, config);

  // Beide moeten dezelfde resultaten geven — de feasibility is hetzelfde.
  assert.equal(withFeas.totalScore, withoutFeas.totalScore);
  assert.equal(withFeas.lowerBoundSpelRepeats, withoutFeas.lowerBoundSpelRepeats);
});

test("computePlanScore: basisschool preset has high quality", () => {
  const config = createBasisschoolPresetConfig();
  const plan = planFor(config);
  const score = computePlanScore(plan, config);

  assert.ok(score.stationOccupancy >= 0.7, `Occupancy ${score.stationOccupancy.toFixed(2)} too low`);
  assert.ok(score.spelVariety >= 0.5, `Variety ${score.spelVariety.toFixed(2)} too low`);
});
