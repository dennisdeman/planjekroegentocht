import assert from "node:assert/strict";
import test from "node:test";
import { buildConfig } from "../packages/core/src/config-builder";
import { generateBestPlan as generatePlan, totalRepeatPenalty } from "../packages/core/src/generator";
import { computeStationOccupancy } from "../packages/core/src/scoring";
import { validatePlan } from "../packages/core/src/validator";

// ---------------------------------------------------------------------------
// Helper: build config with odd groups per pool (= bye)
// ---------------------------------------------------------------------------

function buildOddGroupConfig(pauseActivityName?: string) {
  return buildConfig({
    name: "Oneven test",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 10, // 5 per pool → odd → bye
    spellen: ["Voetbal", "Hockey", "Trefbal", "Volleybal"],
    locations: ["Veld 1", "Veld 2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
    pauseActivityName,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("odd groups per pool: config without pauseActivity has no pause station", () => {
  const { config, calc } = buildOddGroupConfig();
  assert.equal(calc.hasBye, true);
  assert.equal(config.pauseActivity, undefined);
  // No pause station
  assert.ok(
    config.stations.every((s) => s.activityTypeId !== "activity-pause"),
    "No pause stations without pauseActivityName",
  );
});

test("odd groups per pool: config with pauseActivity adds pause stations", () => {
  const { config, calc } = buildOddGroupConfig("Puzzels & Quiz");
  assert.equal(calc.hasBye, true);
  assert.ok(config.pauseActivity);
  assert.equal(config.pauseActivity.name, "Puzzels & Quiz");

  const pauseStations = config.stations.filter((s) => s.activityTypeId === "activity-pause");
  // One pause station per location
  assert.equal(pauseStations.length, 2);
  assert.equal(pauseStations[0].capacityGroupsMin, 1);
  assert.equal(pauseStations[0].capacityGroupsMax, 1);

  // Pause activity type added
  const pauseActivity = config.activityTypes.find((a) => a.id === "activity-pause");
  assert.ok(pauseActivity);
  assert.equal(pauseActivity.name, "Puzzels & Quiz");
});

test("odd groups: generator creates pause allocations", () => {
  const { config } = buildOddGroupConfig("Puzzels & Quiz");
  const result = generatePlan(config);

  // Find allocations on pause stations
  const pauseStationIds = new Set(
    config.stations.filter((s) => s.activityTypeId === "activity-pause").map((s) => s.id),
  );
  const pauseAllocations = result.plan.allocations.filter((a) => pauseStationIds.has(a.stationId));

  // With 5 groups per pool, each round has 1 bye → each active timeslot should have pause allocations
  assert.ok(pauseAllocations.length > 0, "Expected pause allocations for bye groups");

  // Each pause allocation should have exactly 1 group
  for (const alloc of pauseAllocations) {
    assert.equal(alloc.groupIds.length, 1, `Pause allocation should have 1 group, got ${alloc.groupIds.length}`);
  }
});

test("odd groups: pause station excluded from occupancy denominator", () => {
  const { config } = buildOddGroupConfig("Puzzels & Quiz");
  const result = generatePlan(config);

  const pauseStationIds = new Set(
    config.stations.filter((s) => s.activityTypeId === "activity-pause").map((s) => s.id),
  );

  const occWithPause = computeStationOccupancy(result.plan, config, pauseStationIds);
  const occWithout = computeStationOccupancy(result.plan, config);

  // Excluding pause stations should give higher or equal occupancy
  assert.ok(
    occWithPause >= occWithout - 0.01,
    `Occupancy excluding pause (${occWithPause.toFixed(2)}) should be >= without exclusion (${occWithout.toFixed(2)})`,
  );
});

test("odd groups: validator does not error on pause station with 1 group", () => {
  const { config } = buildOddGroupConfig("Puzzels & Quiz");
  const result = generatePlan(config);
  const issues = validatePlan(result.plan, config);

  // No CAPACITY_MISMATCH for pause stations
  const capacityErrors = issues.filter(
    (i) => i.type === "CAPACITY_MISMATCH" && i.refs.stationId &&
      config.stations.find((s) => s.id === i.refs.stationId)?.activityTypeId === "activity-pause",
  );
  assert.equal(capacityErrors.length, 0, "Pause stations should not trigger capacity errors");
});

test("backward compatibility: config without pauseActivity works normally", () => {
  const { config } = buildOddGroupConfig();
  // Should generate fine without pause
  const result = generatePlan(config);
  assert.ok(result.plan.allocations.length > 0);
  const repeats = totalRepeatPenalty(result.plan, config);
  assert.ok(repeats >= 0);
});

test("even groups: no pause station even with pauseActivityName", () => {
  const { config } = buildConfig({
    name: "Even test",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 8, // 4 per pool → even → no bye
    spellen: ["Voetbal", "Hockey"],
    locations: ["Veld 1", "Veld 2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
    pauseActivityName: "Puzzels",
  });

  assert.equal(config.pauseActivity, undefined);
  assert.ok(
    config.stations.every((s) => s.activityTypeId !== "activity-pause"),
    "Even groups should not have pause stations",
  );
});
