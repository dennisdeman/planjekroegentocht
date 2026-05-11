import assert from "node:assert/strict";
import test from "node:test";
import type { ConfigV2, PlanV2 } from "../packages/core/src/model";
import {
  optimizePlanLocalIterative,
  totalRepeatPenalty,
} from "../packages/core/src/generator";

function createIterativeFixture(): { config: ConfigV2; plan: PlanV2 } {
  const config: ConfigV2 = {
    id: "cfg-iterative-opt",
    name: "Iterative Optimizer Fixture",
    segmentsEnabled: true,
    segments: [{ id: "pool-a", name: "Pool A" }],
    groups: [
      { id: "g1", name: "G1", segmentId: "pool-a" },
      { id: "g2", name: "G2", segmentId: "pool-a" },
      { id: "g3", name: "G3", segmentId: "pool-a" },
      { id: "g4", name: "G4", segmentId: "pool-a" },
      { id: "g5", name: "G5", segmentId: "pool-a" },
      { id: "g6", name: "G6", segmentId: "pool-a" },
    ],
    locations: [{ id: "loc-1", name: "Loc 1" }],
    activityTypes: [
      { id: "act-a", name: "Act A" },
      { id: "act-b", name: "Act B" },
      { id: "act-c", name: "Act C" },
    ],
    stations: [
      {
        id: "sA",
        name: "Station A",
        locationId: "loc-1",
        activityTypeId: "act-a",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
      {
        id: "sB",
        name: "Station B",
        locationId: "loc-1",
        activityTypeId: "act-b",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
      {
        id: "sC",
        name: "Station C",
        locationId: "loc-1",
        activityTypeId: "act-c",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
    ],
    timeslots: [
      { id: "slot-1", start: "09:00", end: "09:15", kind: "active", index: 1 },
      { id: "slot-2", start: "09:15", end: "09:30", kind: "active", index: 2 },
      { id: "slot-3", start: "09:30", end: "09:45", kind: "active", index: 3 },
      { id: "slot-4", start: "09:45", end: "10:00", kind: "active", index: 4 },
    ],
    movementPolicy: "blocks",
    locationBlocks: [
      {
        id: "block-1",
        name: "Block 1",
        timeslotIds: ["slot-1", "slot-2", "slot-3", "slot-4"],
        segmentLocationMap: { "pool-a": "loc-1" },
      },
    ],
    constraints: {
      matchupMaxPerPair: 99,
      requireSameSegmentForMatches: true,
      avoidRepeatActivityType: "soft",
    },
    scheduleSettings: {
      roundDurationMinutes: 15,
      transitionMinutes: 0,
      scheduleMode: "round-robin",
    },
  };

  const plan: PlanV2 = {
    id: "plan-iterative-opt",
    configId: config.id,
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    allocations: [
      { id: "a1", timeslotId: "slot-1", stationId: "sA", groupIds: ["g1", "g3"] },
      { id: "a2", timeslotId: "slot-2", stationId: "sA", groupIds: ["g1", "g4"] },
      { id: "a3", timeslotId: "slot-3", stationId: "sB", groupIds: ["g2", "g5"] },
      { id: "a4", timeslotId: "slot-4", stationId: "sB", groupIds: ["g2", "g6"] },
    ],
  };

  return { config, plan };
}

test("optimizePlanLocalIterative reduces score over multiple iterations and stops", () => {
  const { config, plan } = createIterativeFixture();
  const before = totalRepeatPenalty(plan, config);
  assert.equal(before, 2);

  const oneStep = optimizePlanLocalIterative(config, plan, { maxIterations: 1 });
  assert.ok(oneStep.afterScore < before);
  assert.equal(oneStep.iterations, 1);

  const multiStep = optimizePlanLocalIterative(config, plan, { maxIterations: 20 });
  assert.ok(multiStep.afterScore < oneStep.afterScore);
  assert.ok(multiStep.iterations >= 2);

  const stable = optimizePlanLocalIterative(config, multiStep.plan, { maxIterations: 20 });
  assert.equal(stable.afterScore, multiStep.afterScore);
  assert.equal(stable.iterations, 0);
});
