import assert from "node:assert/strict";
import test from "node:test";
import type { ConfigV2, RoundRobinRound } from "../packages/core/src/model";
import { assignToStations } from "../packages/core/src/generator";

function makeConfig(): ConfigV2 {
  return {
    id: "cfg-generator-assignment",
    name: "Generator Assignment Test",
    segmentsEnabled: false,
    segments: [],
    groups: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
      { id: "d", name: "D" },
      { id: "e", name: "E" },
    ],
    locations: [
      { id: "loc-a", name: "Loc A" },
      { id: "loc-b", name: "Loc B" },
    ],
    activityTypes: [
      { id: "act-1", name: "Act 1" },
      { id: "act-2", name: "Act 2" },
    ],
    stations: [
      {
        id: "s-preload",
        name: "S preload",
        locationId: "loc-a",
        activityTypeId: "act-2",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
      {
        id: "s1",
        name: "S1",
        locationId: "loc-b",
        activityTypeId: "act-1",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
      {
        id: "s2",
        name: "S2",
        locationId: "loc-b",
        activityTypeId: "act-2",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
    ],
    timeslots: [
      { id: "slot-1", start: "09:00", end: "09:15", kind: "active", index: 1 },
      { id: "slot-2", start: "09:15", end: "09:30", kind: "active", index: 2 },
      { id: "slot-3", start: "09:30", end: "09:45", kind: "active", index: 3 },
    ],
    movementPolicy: "blocks",
    locationBlocks: [
      {
        id: "block-1",
        name: "Block 1",
        timeslotIds: ["slot-1", "slot-2"],
        segmentLocationMap: { __default__: "loc-a" },
      },
      {
        id: "block-2",
        name: "Block 2",
        timeslotIds: ["slot-3"],
        segmentLocationMap: { __default__: "loc-b" },
      },
    ],
    constraints: {
      matchupMaxPerPair: 2,
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

test("assignToStations uses a global per-slot assignment (not greedy lock-in)", () => {
  const config = makeConfig();
  const rounds: RoundRobinRound[] = [
    { matches: [["c", "d"]] },
    { matches: [["a", "e"]] },
    { matches: [["a", "b"], ["c", "d"]] },
  ];
  const roundsBySegment = new Map<string, RoundRobinRound[]>([
    ["__default__", rounds],
  ]);

  const result = assignToStations(config, roundsBySegment);
  const slot3 = result.plan.allocations.filter((allocation) => allocation.timeslotId === "slot-3");
  assert.equal(slot3.length, 2);

  const assignmentByPair = new Map(
    slot3.map((allocation) => [allocation.groupIds.slice().sort().join("-"), allocation.stationId])
  );
  assert.equal(assignmentByPair.get("a-b"), "s2");
  assert.equal(assignmentByPair.get("c-d"), "s1");
});
