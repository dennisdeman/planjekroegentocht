import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePlanFeasibility,
  buildConfig,
  generateBestPlan,
  totalRepeatPenalty,
  validatePlan,
  hasHardErrors,
} from "../packages/core/src";
import type { ConfigBuilderParams } from "../packages/core/src/config-builder";
import type { ConfigV2 } from "../packages/core/src/model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<ConfigBuilderParams> = {}): ConfigV2 {
  return buildConfig({
    name: "test",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 12,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6"],
    locations: ["Veld 1", "Veld 2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
    ...overrides,
  }).config;
}

// ---------------------------------------------------------------------------
// Strategie-selectie
// ---------------------------------------------------------------------------

test("generateBestPlan: 12g/6s — algebraic probeert en heeft 0 spel-repeats", () => {
  // In round-robin modus weegt matchupCeilingPenalty 5.0 — de algebraïsche
  // constructie genereert eigen matchups die boven het plafond kunnen zitten,
  // waardoor round-robin-exact (betere matchups, maar meer spel-herhalingen)
  // het op totaalscore kan winnen. We testen: algebraic wordt geprobeerd,
  // levert 0 repeats, en de winnaar is de beste op totaalscore.
  const config = makeConfig();
  const result = generateBestPlan(config);

  assert.ok(result.plan.allocations.length > 0);

  const algebraicAttempt = result.attempts.find((a) => a.strategyName === "algebraic");
  assert.ok(algebraicAttempt?.score, "algebraic should have been tried");
  assert.equal(algebraicAttempt.score!.repeatCount, 0);
});

test("generateBestPlan: 16g/8s kiest niet algebraic (H=4 → geen geldige k)", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
  });
  const result = generateBestPlan(config);

  assert.notEqual(result.strategyUsed, "algebraic");
  assert.ok(result.plan.allocations.length > 0);
});

test("generateBestPlan: free mode kiest round-robin-slot", () => {
  const config = makeConfig({
    usePools: false,
    poolNames: [],
    groupCount: 6,
    spellen: ["S1", "S2", "S3"],
    locations: ["Veld 1"],
    movementPolicy: "free",
  });
  const result = generateBestPlan(config);

  // Free mode: round-robin-exact is not applicable, algebraic is not
  // applicable → round-robin-slot wins by default
  assert.equal(result.strategyUsed, "round-robin-slot");
});

// ---------------------------------------------------------------------------
// Eerlijk rapport: attempts bevat alle geprobeerde strategieën
// ---------------------------------------------------------------------------

test("generateBestPlan: attempts bevat alle geprobeerde strategieën", () => {
  const config = makeConfig();
  const result = generateBestPlan(config);

  // 12g/6s/blocks: algebraic, round-robin-exact, round-robin-slot zijn
  // alle drie applicable
  assert.ok(result.attempts.length >= 3, `Expected >= 3 attempts, got ${result.attempts.length}`);

  const names = result.attempts.map((a) => a.strategyName);
  assert.ok(names.includes("algebraic"));
  assert.ok(names.includes("round-robin-exact"));
  assert.ok(names.includes("round-robin-slot"));

  // Elk attempt heeft een score (geen failures verwacht hier)
  for (const attempt of result.attempts) {
    assert.ok(attempt.score, `${attempt.strategyName} should have a score`);
    assert.ok(
      attempt.score.totalScore > 0,
      `${attempt.strategyName} should have positive score`
    );
  }
});

test("generateBestPlan: winnende strategie heeft de hoogste score", () => {
  const config = makeConfig();
  const result = generateBestPlan(config);

  const winnerScore = result.achievedScore.totalScore;
  for (const attempt of result.attempts) {
    if (attempt.score) {
      assert.ok(
        winnerScore >= attempt.score.totalScore,
        `Winner (${result.strategyUsed}: ${winnerScore.toFixed(2)}) should score >= ${attempt.strategyName} (${attempt.score.totalScore.toFixed(2)})`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Feasibility wordt doorgegeven
// ---------------------------------------------------------------------------

test("generateBestPlan: feasibility in resultaat matcht analyzePlanFeasibility", () => {
  const config = makeConfig();
  const result = generateBestPlan(config);
  const standalone = analyzePlanFeasibility(config);

  assert.equal(result.feasibility.mode, standalone.mode);
  assert.equal(
    result.feasibility.totalLowerBoundSpelRepeats,
    standalone.totalLowerBoundSpelRepeats
  );
  assert.equal(result.feasibility.segments.length, standalone.segments.length);
});

// ---------------------------------------------------------------------------
// Ijkpunt-validatie: bereikt minstens het wiskundige minimum
// ---------------------------------------------------------------------------

test("generateBestPlan: 12g/6s — algebraic bereikt wiskundig minimum, winnaar op totaalscore", () => {
  const config = makeConfig();
  const result = generateBestPlan(config);

  assert.equal(result.feasibility.totalLowerBoundSpelRepeats, 0);

  // Het wiskundig minimum (0 spel-herhalingen) wordt bereikt door algebraic.
  // Maar de winnaar is de strategie met de hoogste totaalscore — die
  // kan een andere zijn als de matchup-penalty de spel-repeat-winst
  // overschaduwt (in round-robin modus).
  const algebraicAttempt = result.attempts.find((a) => a.strategyName === "algebraic");
  assert.ok(algebraicAttempt?.score);
  assert.equal(
    algebraicAttempt.score!.repeatCount,
    result.feasibility.totalLowerBoundSpelRepeats,
    "algebraic should reach the mathematical minimum"
  );

  // De winnaar heeft de hoogste totaalscore — dat is de gevalideerde eis.
  assert.equal(result.achievedScore.totalScore, Math.max(
    ...result.attempts.filter((a) => a.score).map((a) => a.score!.totalScore)
  ));
});

test("generateBestPlan: 20g/10s — algebraic probeert en heeft 0 repeats, winnaar is op score", () => {
  const config = makeConfig({
    groupCount: 20,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const result = generateBestPlan(config);

  assert.equal(result.feasibility.totalLowerBoundSpelRepeats, 0);
  assert.ok(result.plan.allocations.length > 0);

  // Algebraic wordt geprobeerd en levert 0 spel-herhalingen, maar in
  // round-robin modus (matchupCeilingPenalty gewicht 5.0) kan het
  // verliezen van round-robin-exact omdat de algebraïsche matchups boven
  // het matchup-plafond zitten. Dit is correct gedrag — de scoring kiest
  // de beste balans, niet de laagste spel-herhalingen.
  const algebraicAttempt = result.attempts.find((a) => a.strategyName === "algebraic");
  assert.ok(algebraicAttempt?.score, "algebraic should have been tried");
  assert.equal(algebraicAttempt.score!.repeatCount, 0);
});

test("generateBestPlan: 8g/4s (H=2, geen algebraic) produceert geldig plan", () => {
  const config = makeConfig({
    groupCount: 8,
    spellen: ["S1", "S2", "S3", "S4"],
    scheduleMode: "all-spellen",
  });
  const result = generateBestPlan(config);

  assert.ok(result.plan.allocations.length > 0);
  assert.notEqual(result.strategyUsed, "algebraic");

  // Geen structurele fouten
  const issues = validatePlan(result.plan, config);
  const structural = issues.filter(
    (i) =>
      i.severity === "error" &&
      ["DOUBLE_BOOKING_GROUP", "STATION_OVERBOOKED", "CAPACITY_MISMATCH", "CROSS_SEGMENT_MATCH"].includes(i.type)
  );
  assert.equal(structural.length, 0);
});

// generatePlan alias test verwijderd — alias is verwijderd in stap 3.7.
