import assert from "node:assert/strict";
import test from "node:test";
import { createBasisschoolPresetConfig } from "../lib/planner/defaults";
import {
  generateBestPlan as generatePlan,
  hasHardErrors,
  optimizeExistingPlanStations,
  totalRepeatPenalty,
  validatePlan,
} from "../packages/core/src";

function allocationSnapshot(plan: { allocations: Array<{ id: string; stationId: string }> }) {
  return plan.allocations
    .map((allocation) => ({ id: allocation.id, stationId: allocation.stationId }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

test("station-only optimizer keeps timeslot/group structure fixed", () => {
  const config = createBasisschoolPresetConfig("cfg-opt-existing-structure");
  config.scheduleSettings = {
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    scheduleMode: "all-spellen",
  };
  const baseline = generatePlan(config).plan;

  const optimized = optimizeExistingPlanStations(config, baseline);

  assert.equal(optimized.plan.allocations.length, baseline.allocations.length);
  const baselineById = new Map(baseline.allocations.map((allocation) => [allocation.id, allocation]));
  for (const allocation of optimized.plan.allocations) {
    const original = baselineById.get(allocation.id);
    assert.ok(original);
    assert.equal(allocation.timeslotId, original.timeslotId);
    assert.deepEqual([...allocation.groupIds].sort(), [...original.groupIds].sort());
  }
});

test("station-only optimizer can solve basisschool fixture to zero repeats", () => {
  const config = createBasisschoolPresetConfig("cfg-opt-existing-zero");
  config.scheduleSettings = {
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    scheduleMode: "all-spellen",
  };
  const baseline = generatePlan(config).plan;
  const before = totalRepeatPenalty(baseline, config);

  const optimized = optimizeExistingPlanStations(config, baseline);
  const issues = validatePlan(optimized.plan, config);
  const repeatIssues = issues.filter((issue) => issue.type === "REPEAT_ACTIVITYTYPE_FOR_GROUP");

  assert.ok(before >= optimized.repeatPenaltyAfter);
  assert.equal(optimized.repeatPenaltyAfter, 0);
  assert.equal(repeatIssues.length, 0);
  assert.equal(hasHardErrors(issues), false);
  assert.equal(optimized.solvedZero, true);
});

test("station-only optimizer ignores allocation.id semantics", () => {
  const config = createBasisschoolPresetConfig("cfg-opt-existing-id-opaque");
  config.scheduleSettings = {
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    scheduleMode: "all-spellen",
  };
  const baseline = generatePlan(config).plan;
  const spoofed = {
    ...baseline,
    allocations: baseline.allocations.map((allocation, index) => ({
      ...allocation,
      id: `x1-looks-like-station-${String(index).padStart(3, "0")}`,
    })),
  };

  const optimized = optimizeExistingPlanStations(config, spoofed);
  const issues = validatePlan(optimized.plan, config);

  assert.equal(hasHardErrors(issues), false);
  assert.equal(
    issues.filter((issue) => issue.type === "REPEAT_ACTIVITYTYPE_FOR_GROUP").length,
    0
  );
  assert.equal(optimized.solvedZero, true);
});

test("station-only optimizer is deterministic", () => {
  const config = createBasisschoolPresetConfig("cfg-opt-existing-deterministic");
  config.scheduleSettings = {
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    scheduleMode: "all-spellen",
  };
  const baseline = generatePlan(config).plan;

  const first = optimizeExistingPlanStations(config, baseline);
  const second = optimizeExistingPlanStations(config, baseline);

  assert.equal(first.repeatPenaltyAfter, second.repeatPenaltyAfter);
  assert.deepEqual(first.changedAllocations, second.changedAllocations);
  assert.deepEqual(allocationSnapshot(first.plan), allocationSnapshot(second.plan));
});
