import assert from "node:assert/strict";
import test from "node:test";
import { validatePlan } from "../packages/core/src/validator";
import { createBaseConfigV2, createPlanTemplate } from "./v2-fixtures";

test("validator catches hard rules", () => {
  const config = createBaseConfigV2();
  const plan = createPlanTemplate(config);
  plan.allocations = [
    // double booking group + station overbooked + cross-segment + capacity mismatch
    {
      id: "a1",
      timeslotId: "slot-1",
      stationId: "x1",
      groupIds: ["xa", "ya", "xb"],
    },
    {
      id: "a2",
      timeslotId: "slot-1",
      stationId: "x1",
      groupIds: ["xa", "xc"],
    },
    // duplicate matchup
    {
      id: "a3",
      timeslotId: "slot-2",
      stationId: "x2",
      groupIds: ["xd", "xb"],
    },
    {
      id: "a4",
      timeslotId: "slot-4",
      stationId: "y1",
      groupIds: ["xb", "xd"],
    },
    // break slot has allocation
    {
      id: "a5",
      timeslotId: "slot-3",
      stationId: "y2",
      groupIds: ["ya", "yb"],
    },
  ];

  const issues = validatePlan(plan, config);
  const types = new Set(issues.map((issue) => issue.type));
  assert.ok(types.has("DOUBLE_BOOKING_GROUP"));
  assert.ok(types.has("STATION_OVERBOOKED"));
  assert.ok(types.has("CAPACITY_MISMATCH"));
  assert.ok(types.has("CROSS_SEGMENT_MATCH"));
  assert.ok(types.has("DUPLICATE_MATCHUP"));
  assert.ok(types.has("BREAK_SLOT_HAS_ALLOCATIONS"));
});
