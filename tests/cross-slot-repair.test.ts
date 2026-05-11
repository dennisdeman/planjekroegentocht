import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePlanFeasibility,
  buildConfig,
  crossSlotRepair,
  generateBestPlan,
  totalRepeatPenalty,
  validatePlan,
  hasHardErrors,
} from "../packages/core/src";
import type { ConfigV2 } from "../packages/core/src/model";

// ---------------------------------------------------------------------------
// Idempotent op een al-optimaal plan
// ---------------------------------------------------------------------------

test("crossSlotRepair: no swaps on a zero-repeat plan", () => {
  // 12g/6s genereert een plan met 0 of lage herhalingen
  const config = buildConfig({
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

  const plan = generateBestPlan(config).plan;
  const repeats = totalRepeatPenalty(plan, config);

  const feasibility = analyzePlanFeasibility(config);
  const result = crossSlotRepair(config, plan, { feasibility });

  // Cross-slot mag het niet slechter maken
  const afterRepeats = totalRepeatPenalty(result.plan, config);
  assert.ok(afterRepeats <= repeats);

  if (repeats === 0) {
    assert.equal(result.appliedSwaps.length, 0);
    assert.equal(afterRepeats, 0);
  }
});

// ---------------------------------------------------------------------------
// Geen structurele fouten na repair
// ---------------------------------------------------------------------------

test("crossSlotRepair: produces no structural hard errors", () => {
  const config = buildConfig({
    name: "16g/8s",
    usePools: true,
    poolNames: ["A", "B"],
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
    locations: ["V1", "V2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
  }).config;

  const plan = generateBestPlan(config).plan;
  const feasibility = analyzePlanFeasibility(config);
  const result = crossSlotRepair(config, plan, { feasibility });

  const issues = validatePlan(result.plan, config);
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
  assert.equal(
    structural.length,
    0,
    `Structural errors after cross-slot repair: ${structural.map((i) => i.type + ": " + i.message).join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// Free mode: cross-slot kan verbeteren
// ---------------------------------------------------------------------------

test("crossSlotRepair: works on free mode config", () => {
  const config = buildConfig({
    name: "free-mode",
    usePools: false,
    poolNames: [],
    groupCount: 6,
    spellen: ["S1", "S2", "S3"],
    locations: ["V1"],
    movementPolicy: "free",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
  }).config;

  const plan = generateBestPlan(config).plan;
  const repeats = totalRepeatPenalty(plan, config);
  const feasibility = analyzePlanFeasibility(config);
  const result = crossSlotRepair(config, plan, { feasibility });

  const afterRepeats = totalRepeatPenalty(result.plan, config);
  assert.ok(afterRepeats <= repeats, "cross-slot should not worsen repeats");

  // Geen structurele fouten
  const issues = validatePlan(result.plan, config);
  assert.equal(hasHardErrors(issues), false);
});

// ---------------------------------------------------------------------------
// maxIterations wordt gerespecteerd
// ---------------------------------------------------------------------------

test("crossSlotRepair: respects maxIterations", () => {
  const config = buildConfig({
    name: "max-iter",
    usePools: false,
    poolNames: [],
    groupCount: 6,
    spellen: ["S1", "S2", "S3"],
    locations: ["V1"],
    movementPolicy: "free",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
  }).config;

  const plan = generateBestPlan(config).plan;
  const feasibility = analyzePlanFeasibility(config);
  const result = crossSlotRepair(config, plan, {
    feasibility,
    maxIterations: 1,
  });

  assert.ok(result.iterations <= 1);
});
