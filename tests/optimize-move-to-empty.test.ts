import assert from "node:assert/strict";
import test from "node:test";
import type { ConfigV2, PlanV2 } from "../packages/core/src/model";
import { optimizePlanLocal, totalRepeatPenalty } from "../packages/core/src/generator";

function makeConfig(): ConfigV2 {
  return {
    id: "cfg-optimize-empty",
    name: "Optimize Move To Empty",
    segmentsEnabled: true,
    segments: [{ id: "pool-y", name: "Pool Y" }],
    groups: [
      { id: "ya", name: "YA", segmentId: "pool-y" },
      { id: "yh", name: "YH", segmentId: "pool-y" },
      { id: "yk", name: "YK", segmentId: "pool-y" },
    ],
    locations: [{ id: "veld-2", name: "Veld 2" }],
    activityTypes: [
      { id: "basketbal", name: "Basketbal" },
      { id: "tikkertje", name: "Tikkertje" },
    ],
    stations: [
      {
        id: "s-basket",
        name: "Basketbal",
        locationId: "veld-2",
        activityTypeId: "basketbal",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
      {
        id: "s-tik",
        name: "Tikkertje",
        locationId: "veld-2",
        activityTypeId: "tikkertje",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
    ],
    timeslots: [
      { id: "slot-1", start: "09:00", end: "09:15", kind: "active", index: 1 },
      { id: "slot-2", start: "09:15", end: "09:30", kind: "active", index: 2 },
    ],
    movementPolicy: "blocks",
    locationBlocks: [
      {
        id: "block-1",
        name: "Blok 1",
        timeslotIds: ["slot-1", "slot-2"],
        segmentLocationMap: { "pool-y": "veld-2" },
      },
    ],
    constraints: {
      matchupMaxPerPair: 1,
      requireSameSegmentForMatches: true,
      avoidRepeatActivityType: "soft",
    },
    scheduleSettings: {
      roundDurationMinutes: 15,
      transitionMinutes: 0,
      scheduleMode: "round-robin",
    },
  };
}

function makePlan(configId: string): PlanV2 {
  return {
    id: "plan-optimize-empty",
    configId,
    allocations: [
      {
        id: "a1",
        timeslotId: "slot-1",
        stationId: "s-basket",
        groupIds: ["ya", "yk"],
      },
      {
        id: "a2",
        timeslotId: "slot-2",
        stationId: "s-basket",
        groupIds: ["ya", "yh"],
      },
    ],
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("optimizePlanLocal moves repeat match to empty station when score improves", () => {
  const config = makeConfig();
  const initial = makePlan(config.id);
  const before = totalRepeatPenalty(initial, config);
  assert.equal(before, 1);

  const optimized = optimizePlanLocal(config, initial);
  const after = totalRepeatPenalty(optimized, config);

  assert.equal(after, 0);
  const movedToTik = optimized.allocations.filter(
    (allocation) => allocation.stationId === "s-tik"
  );
  assert.equal(movedToTik.length, 1);
});
