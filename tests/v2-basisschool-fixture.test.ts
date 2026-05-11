import assert from "node:assert/strict";
import test from "node:test";
import { generateBestPlan as generatePlan } from "../packages/core/src/generator";
import { validatePlan } from "../packages/core/src/validator";
import { createBasisschoolPresetConfig } from "../lib/planner/defaults";

test("basisschool preset generates without hard errors", () => {
  const config = createBasisschoolPresetConfig("cfg-v2-preset-test");
  const generated = generatePlan(config);
  const issues = validatePlan(generated.plan, config);
  const errors = issues.filter((issue) => issue.severity === "error");
  assert.equal(errors.length, 0);
});
