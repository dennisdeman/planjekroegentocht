import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePlanFeasibility,
  buildConfig,
  shuffledRoundsStrategy,
  roundRobinExactStrategy,
  validatePlan,
  hasHardErrors,
  totalRepeatPenalty,
} from "../packages/core/src";
import type { ConfigBuilderParams } from "../packages/core/src/config-builder";
import type { ConfigV2 } from "../packages/core/src/model";

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
// applicable
// ---------------------------------------------------------------------------

test("shuffled-rounds: applicable for blocks mode with locationBlocks", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(shuffledRoundsStrategy.applicable(config, feasibility), true);
});

test("shuffled-rounds: not applicable for free mode", () => {
  const config = makeConfig({
    usePools: false,
    poolNames: [],
    groupCount: 6,
    spellen: ["S1", "S2", "S3"],
    locations: ["Veld 1"],
    movementPolicy: "free",
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(shuffledRoundsStrategy.applicable(config, feasibility), false);
});

// ---------------------------------------------------------------------------
// generate: produces valid plans
// ---------------------------------------------------------------------------

test("shuffled-rounds: generates valid plan for 12g/6s", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  const attempt = shuffledRoundsStrategy.generate(config, feasibility);

  assert.ok(attempt);
  assert.equal(attempt.strategyName, "shuffled-rounds");
  assert.ok(attempt.plan.allocations.length > 0);

  const issues = validatePlan(attempt.plan, config);
  const structural = issues.filter(
    (i) =>
      i.severity === "error" &&
      ["DOUBLE_BOOKING_GROUP", "STATION_OVERBOOKED", "CAPACITY_MISMATCH", "CROSS_SEGMENT_MATCH"].includes(i.type)
  );
  assert.equal(structural.length, 0);
});

test("shuffled-rounds: generates valid plan for 16g/8s", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
  });
  const feasibility = analyzePlanFeasibility(config);
  const attempt = shuffledRoundsStrategy.generate(config, feasibility);

  assert.ok(attempt);
  assert.ok(attempt.plan.allocations.length > 0);
});

// ---------------------------------------------------------------------------
// Geen verslechtering t.o.v. round-robin-exact
// ---------------------------------------------------------------------------

test("shuffled-rounds: repeats <= round-robin-exact for 12g/6s", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);

  const shuffled = shuffledRoundsStrategy.generate(config, feasibility);
  const exact = roundRobinExactStrategy.generate(config, feasibility);

  assert.ok(shuffled);
  assert.ok(exact);

  const shuffledRepeats = totalRepeatPenalty(shuffled.plan, config);
  const exactRepeats = totalRepeatPenalty(exact.plan, config);

  assert.ok(
    shuffledRepeats <= exactRepeats,
    `shuffled-rounds (${shuffledRepeats}) should not be worse than round-robin-exact (${exactRepeats})`
  );
});

test("shuffled-rounds: repeats <= round-robin-exact for 18g/10s", () => {
  const config = makeConfig({
    groupCount: 18,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const feasibility = analyzePlanFeasibility(config);

  const shuffled = shuffledRoundsStrategy.generate(config, feasibility);
  const exact = roundRobinExactStrategy.generate(config, feasibility);

  assert.ok(shuffled);
  assert.ok(exact);

  const shuffledRepeats = totalRepeatPenalty(shuffled.plan, config);
  const exactRepeats = totalRepeatPenalty(exact.plan, config);

  assert.ok(
    shuffledRepeats <= exactRepeats,
    `shuffled-rounds (${shuffledRepeats}) should not be worse than round-robin-exact (${exactRepeats})`
  );
});
