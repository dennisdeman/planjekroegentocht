import assert from "node:assert/strict";
import test from "node:test";
import { createBasisschoolPresetConfig } from "../lib/planner/defaults";
import { NoSolutionError, generateBestPlan as generatePlan } from "../packages/core/src/generator";
import { validatePlan } from "../packages/core/src/validator";

test("hard mode never returns invalid repeat plan", () => {
  const config = createBasisschoolPresetConfig("cfg-hard-never-invalid");
  config.constraints.avoidRepeatActivityType = "hard";

  try {
    const generated = generatePlan(config);
    const issues = validatePlan(generated.plan, config);
    const repeatErrors = issues.filter(
      (issue) =>
        issue.type === "REPEAT_ACTIVITYTYPE_FOR_GROUP" && issue.severity === "error"
    );
    assert.equal(repeatErrors.length, 0);
  } catch (error) {
    assert.ok(error instanceof NoSolutionError);
  }
});
