import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePlanFeasibility,
  buildConfig,
  byeAssistedStrategy,
  validatePlan,
  totalRepeatPenalty,
} from "../packages/core/src";
import type { ConfigBuilderParams } from "../packages/core/src/config-builder";
import type { ConfigV2 } from "../packages/core/src/model";

function makeConfig(overrides: Partial<ConfigBuilderParams> = {}): ConfigV2 {
  return buildConfig({
    name: "test",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
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

test("bye-assisted: applicable for 16g/8s (even pool, H=4, not algebraic)", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(byeAssistedStrategy.applicable(config, feasibility), true);
});

test("bye-assisted: not applicable for 12g/6s (algebraic feasible)", () => {
  const config = makeConfig({
    groupCount: 12,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6"],
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(byeAssistedStrategy.applicable(config, feasibility), false);
});

test("bye-assisted: not applicable for 20g/10s (algebraic feasible)", () => {
  const config = makeConfig({
    groupCount: 20,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(byeAssistedStrategy.applicable(config, feasibility), false);
});

test("bye-assisted: not applicable for odd pool (18g)", () => {
  const config = makeConfig({
    groupCount: 18,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(byeAssistedStrategy.applicable(config, feasibility), false);
});

// ---------------------------------------------------------------------------
// generate: produces valid plans with fewer repeats
// ---------------------------------------------------------------------------

test("bye-assisted: 16g/8s produces plan with fewer repeats than standard", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  const attempt = byeAssistedStrategy.generate(config, feasibility);

  assert.ok(attempt, "should produce a plan");
  assert.equal(attempt.strategyName, "bye-assisted");
  assert.ok(attempt.plan.allocations.length > 0);
  assert.ok(attempt.scoringConfig, "should have scoringConfig (expanded)");

  // Bye-assisted haalt significant minder herhalingen dan de 10 van standaard
  const repeats = totalRepeatPenalty(attempt.plan, attempt.scoringConfig!);
  assert.ok(repeats <= 4, `Expected <= 4 repeats, got ${repeats}`);
});

test("bye-assisted: 16g/10s reaches 0 repeats", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const feasibility = analyzePlanFeasibility(config);
  const attempt = byeAssistedStrategy.generate(config, feasibility);

  assert.ok(attempt, "should produce a plan");
  const repeats = totalRepeatPenalty(attempt.plan, attempt.scoringConfig!);
  assert.equal(repeats, 0, "16g/10s bye-assisted should reach 0 repeats");
});

test("bye-assisted: plan has extra timeslot allocations", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  const attempt = byeAssistedStrategy.generate(config, feasibility);

  assert.ok(attempt);
  // Het plan heeft allocaties in het extra timeslot
  const originalSlotIds = new Set(config.timeslots.map((t) => t.id));
  const extraAllocations = attempt.plan.allocations.filter(
    (a) => !originalSlotIds.has(a.timeslotId)
  );
  assert.ok(
    extraAllocations.length > 0,
    "Plan should contain allocations in the extra timeslot"
  );
});

test("bye-assisted: no ghost groups in output", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  const attempt = byeAssistedStrategy.generate(config, feasibility);

  assert.ok(attempt);
  for (const alloc of attempt.plan.allocations) {
    for (const gid of alloc.groupIds) {
      assert.ok(
        !gid.startsWith("__bye_ghost__"),
        `Ghost group ${gid} should not appear in output`
      );
    }
  }
});

test("bye-assisted: no structural hard errors on expanded config", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  const attempt = byeAssistedStrategy.generate(config, feasibility);

  assert.ok(attempt?.scoringConfig);
  const issues = validatePlan(attempt.plan, attempt.scoringConfig!);
  const structural = issues.filter(
    (i) =>
      i.severity === "error" &&
      [
        "DOUBLE_BOOKING_GROUP",
        "STATION_OVERBOOKED",
        "CAPACITY_MISMATCH",
        "CROSS_SEGMENT_MATCH",
      ].includes(i.type)
  );
  assert.equal(structural.length, 0);
});
