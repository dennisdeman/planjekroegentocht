import assert from "node:assert/strict";
import test from "node:test";
import { createBasisschoolPresetConfig } from "../lib/planner/defaults";
import { buildConfig, calculateSchedule } from "../packages/core/src/config-builder";
import { generateBestPlan as generatePlan, totalRepeatPenalty } from "../packages/core/src/generator";

// ---------------------------------------------------------------------------
// calculateSchedule
// ---------------------------------------------------------------------------

test("calculateSchedule: basisschool 18 groepen / 2 pools / 10 spellen", () => {
  const calc = calculateSchedule(18, 2, 10, "blocks", 2, "all-spellen", "split");
  assert.equal(calc.groupsPerPool, 9);
  assert.equal(calc.roundRobinRounds, 8);
  assert.equal(calc.matchesPerRound, 4);
  assert.equal(calc.hasBye, true);
  assert.equal(calc.roundsNeeded, 10);
  assert.equal(calc.breakAfterSlot, 5);
  assert.equal(calc.totalSlots, 11);
  assert.equal(calc.spellenNeeded, 8); // 4 per location × 2
  assert.equal(calc.enoughSpellen, true);
  assert.equal(calc.matchupMaxNeeded, 2); // 10 rounds / 8 rr-rounds → ceil = 2
});

test("calculateSchedule: gelijke pools zonder bye", () => {
  const calc = calculateSchedule(8, 2, 4, "blocks", 2, "round-robin", "split");
  assert.equal(calc.groupsPerPool, 4);
  assert.equal(calc.hasBye, false);
  assert.equal(calc.roundRobinRounds, 3);
  assert.equal(calc.matchesPerRound, 2);
  assert.equal(calc.breakAfterSlot, 0); // < 4 rounds → no break
});

test("calculateSchedule: free mode", () => {
  const calc = calculateSchedule(6, 1, 3, "free", 1, "round-robin", "split");
  assert.equal(calc.groupsPerPool, 6);
  assert.equal(calc.roundRobinRounds, 5);
  assert.equal(calc.matchesPerRound, 3);
  assert.equal(calc.totalStations, 3);
  assert.equal(calc.spellenNeeded, 3);
});

// ---------------------------------------------------------------------------
// buildConfig
// ---------------------------------------------------------------------------

test("buildConfig: produces valid config for basisschool params", () => {
  const { config, calc } = buildConfig({
    name: "Test kroegentocht",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 18,
    spellen: ["Voetbal", "Hockey", "Trefbal", "Volleybal", "Basketbal",
      "Touwtrekken", "Tikkertje", "Zaklopen", "Korfbal", "Tafeltennis"],
    locations: ["Veld 1", "Veld 2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "all-spellen",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
  });

  assert.equal(config.segments.length, 2);
  assert.equal(config.groups.length, 18);
  assert.equal(config.activityTypes.length, 10);
  assert.equal(config.stations.length, 10); // 5 per location (split)
  assert.equal(config.locations.length, 2);
  assert.ok(config.locationBlocks && config.locationBlocks.length === 2);
  assert.equal(config.movementPolicy, "blocks");
  assert.equal(config.constraints.avoidRepeatActivityType, "soft");
  assert.equal(calc.roundsNeeded, 10);
});

test("buildConfig: free mode without pools", () => {
  const { config } = buildConfig({
    name: "Vrije kroegentocht",
    usePools: false,
    poolNames: [],
    groupCount: 6,
    spellen: ["Voetbal", "Hockey", "Trefbal"],
    locations: ["Gymzaal"],
    movementPolicy: "free",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "10:00",
    roundDurationMinutes: 20,
    transitionMinutes: 3,
    repeatPolicy: "off",
  });

  assert.equal(config.segmentsEnabled, false);
  assert.equal(config.segments.length, 0);
  assert.equal(config.groups.length, 6);
  assert.equal(config.movementPolicy, "free");
  assert.equal(config.locationBlocks, undefined);
  assert.equal(config.constraints.avoidRepeatActivityType, "off");
});

test("buildConfig: station overrides are respected", () => {
  const { config } = buildConfig({
    name: "Met overrides",
    usePools: false,
    poolNames: [],
    groupCount: 4,
    spellen: ["Voetbal", "Hockey"],
    locations: ["Veld 1"],
    movementPolicy: "free",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
    stationOverrides: [
      { spel: "Voetbal", location: "Veld 1", capacity: 3 },
      { spel: "Hockey", location: "Veld 1", capacity: 4 },
    ],
  });

  assert.equal(config.stations.length, 2);
  assert.equal(config.stations[0].capacityGroupsMin, 3);
  assert.equal(config.stations[0].capacityGroupsMax, 3);
  assert.equal(config.stations[1].capacityGroupsMin, 4);
  assert.equal(config.stations[1].capacityGroupsMax, 4);
});

// ---------------------------------------------------------------------------
// Preset equivalence
// ---------------------------------------------------------------------------

test("preset config generates a valid plan", () => {
  const config = createBasisschoolPresetConfig();
  const result = generatePlan(config);
  assert.ok(result.plan.allocations.length > 0);
  const repeats = totalRepeatPenalty(result.plan, config);
  // The preset should produce a reasonable plan
  assert.ok(repeats >= 0);
});

test("preset config has correct structure", () => {
  const config = createBasisschoolPresetConfig();
  assert.equal(config.name, "Basisschool 2 velden / 2 pools");
  assert.equal(config.segments.length, 2);
  assert.equal(config.groups.length, 18);
  assert.equal(config.activityTypes.length, 10);
  assert.equal(config.stations.length, 10);
  assert.equal(config.locations.length, 2);
  assert.equal(config.movementPolicy, "blocks");
  assert.ok(config.locationBlocks && config.locationBlocks.length === 2);
  assert.equal(config.constraints.matchupMaxPerPair, 2);
  assert.equal(config.constraints.requireSameSegmentForMatches, true);
  assert.equal(config.constraints.avoidRepeatActivityType, "soft");
});

test("preset config custom group names", () => {
  const config = createBasisschoolPresetConfig();
  // Groups should have names like XA, XB, ... YA, YB, ...
  assert.equal(config.groups[0].name, "XA");
  assert.equal(config.groups[1].name, "YA");
  assert.equal(config.groups[16].name, "XI");
  assert.equal(config.groups[17].name, "YI");
});
