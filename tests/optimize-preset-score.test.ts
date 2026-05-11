import assert from "node:assert/strict";
import test from "node:test";
import { createBasisschoolPresetConfig } from "../lib/planner/defaults";
import {
  assignToStations,
  generateBestPlan as generatePlan,
  generateRoundRobin,
  totalRepeatPenalty,
} from "../packages/core/src/generator";

test("optimizer reduces repeat score on basisschool preset", () => {
  const config = createBasisschoolPresetConfig("cfg-optimize-score");
  const roundsBySegment = new Map<string, ReturnType<typeof generateRoundRobin>>();
  for (const segment of config.segments) {
    const groupIds = config.groups
      .filter((group) => group.segmentId === segment.id)
      .map((group) => group.id);
    roundsBySegment.set(segment.id, generateRoundRobin(groupIds));
  }

  const assigned = assignToStations(config, roundsBySegment);
  const before = totalRepeatPenalty(assigned.plan, config);

  const generated = generatePlan(config);
  const after = totalRepeatPenalty(generated.plan, config);

  assert.ok(after <= before);
  assert.ok(after < before);
});
