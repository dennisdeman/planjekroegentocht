import assert from "node:assert/strict";
import test from "node:test";
import { validatePlan } from "../packages/core/src/validator";
import { createBaseConfigV2, createPlanTemplate } from "./v2-fixtures";

test("repeat activity issues include slot/allocation refs", () => {
  const config = createBaseConfigV2();
  const plan = createPlanTemplate(config);
  plan.allocations = [
    {
      id: "a1",
      timeslotId: "slot-1",
      stationId: "x1",
      groupIds: ["xa", "xb"],
    },
    {
      id: "a2",
      timeslotId: "slot-2",
      stationId: "x1",
      groupIds: ["xa", "xc"],
    },
  ];

  const issue = validatePlan(plan, config).find(
    (candidate) =>
      candidate.type === "REPEAT_ACTIVITYTYPE_FOR_GROUP" &&
      candidate.refs.groupIds?.includes("xa")
  );

  assert.ok(issue);
  assert.equal(issue.refs.timeslotId, "slot-1");
  assert.equal(issue.refs.allocationId, "a1");
  assert.deepEqual(issue.refs.timeslotIds, ["slot-1", "slot-2"]);
  assert.deepEqual(issue.refs.allocationIds, ["a1", "a2"]);
  assert.equal(issue.refs.occurrences?.length, 2);
  assert.deepEqual(issue.refs.occurrences?.map((item) => item.allocationId), ["a1", "a2"]);
});
