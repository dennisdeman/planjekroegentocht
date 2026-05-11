import type { ConfigV2, PlanV2 } from "../packages/core/src/model";

export function createBaseConfigV2(): ConfigV2 {
  return {
    id: "cfg-v2-test",
    name: "V2 Test Config",
    segmentsEnabled: true,
    segments: [
      { id: "pool-x", name: "Pool X" },
      { id: "pool-y", name: "Pool Y" },
    ],
    groups: [
      { id: "xa", name: "XA", segmentId: "pool-x" },
      { id: "xb", name: "XB", segmentId: "pool-x" },
      { id: "xc", name: "XC", segmentId: "pool-x" },
      { id: "xd", name: "XD", segmentId: "pool-x" },
      { id: "ya", name: "YA", segmentId: "pool-y" },
      { id: "yb", name: "YB", segmentId: "pool-y" },
      { id: "yc", name: "YC", segmentId: "pool-y" },
      { id: "yd", name: "YD", segmentId: "pool-y" },
    ],
    locations: [
      { id: "veld-1", name: "Veld 1" },
      { id: "veld-2", name: "Veld 2" },
    ],
    activityTypes: [
      { id: "act-1", name: "Voetbal" },
      { id: "act-2", name: "Hockey" },
      { id: "act-3", name: "Trefbal" },
      { id: "act-4", name: "Volleybal" },
    ],
    stations: [
      {
        id: "x1",
        name: "X1",
        locationId: "veld-1",
        activityTypeId: "act-1",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
      {
        id: "x2",
        name: "X2",
        locationId: "veld-1",
        activityTypeId: "act-2",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
      {
        id: "y1",
        name: "Y1",
        locationId: "veld-2",
        activityTypeId: "act-3",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
      {
        id: "y2",
        name: "Y2",
        locationId: "veld-2",
        activityTypeId: "act-4",
        capacityGroupsMin: 2,
        capacityGroupsMax: 2,
      },
    ],
    timeslots: [
      {
        id: "slot-1",
        start: "09:00",
        end: "09:15",
        kind: "active",
        index: 1,
      },
      {
        id: "slot-2",
        start: "09:15",
        end: "09:30",
        kind: "active",
        index: 2,
      },
      {
        id: "slot-3",
        start: "09:30",
        end: "09:45",
        kind: "break",
        index: 3,
      },
      {
        id: "slot-4",
        start: "09:45",
        end: "10:00",
        kind: "active",
        index: 4,
      },
    ],
    movementPolicy: "blocks",
    locationBlocks: [
      {
        id: "b1",
        name: "blok 1",
        timeslotIds: ["slot-1", "slot-2"],
        segmentLocationMap: { "pool-x": "veld-1", "pool-y": "veld-2" },
      },
      {
        id: "b2",
        name: "blok 2",
        timeslotIds: ["slot-4"],
        segmentLocationMap: { "pool-x": "veld-2", "pool-y": "veld-1" },
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

export function createPlanTemplate(config: ConfigV2): PlanV2 {
  return {
    id: "plan-v2-test",
    configId: config.id,
    allocations: [],
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}
