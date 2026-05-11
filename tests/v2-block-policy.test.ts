import assert from "node:assert/strict";
import test from "node:test";
import { generateBestPlan as generatePlan } from "../packages/core/src/generator";
import { createBaseConfigV2 } from "./v2-fixtures";

test("assignment respects block policy segment -> location per timeslot", () => {
  const config = createBaseConfigV2();
  const generated = generatePlan(config);
  const stationLocationById = new Map(config.stations.map((station) => [station.id, station.locationId]));
  const blockByTimeslot = new Map<string, Record<string, string>>();
  for (const block of config.locationBlocks ?? []) {
    for (const timeslotId of block.timeslotIds) {
      blockByTimeslot.set(timeslotId, block.segmentLocationMap);
    }
  }
  const groupSegmentById = new Map(config.groups.map((group) => [group.id, group.segmentId ?? ""]));

  for (const allocation of generated.plan.allocations) {
    const firstGroup = allocation.groupIds[0];
    const segmentId = groupSegmentById.get(firstGroup);
    const expectedLocation = segmentId
      ? blockByTimeslot.get(allocation.timeslotId)?.[segmentId]
      : undefined;
    const actualLocation = stationLocationById.get(allocation.stationId);
    if (expectedLocation) {
      assert.equal(actualLocation, expectedLocation);
    }
  }
});
