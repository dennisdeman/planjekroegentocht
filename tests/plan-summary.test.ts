import assert from "node:assert/strict";
import test from "node:test";
import { buildConfig } from "../packages/core/src/config-builder";
import { generateBestPlan as generatePlan } from "../packages/core/src/generator";
import { generatePlanSummary } from "../packages/core/src/plan-summary";
import { computePlanScore } from "../packages/core/src/scoring";
import { createBaseConfigV2 } from "./v2-fixtures";

test("summary: zero-repeat plan shows good severity", () => {
  const config = createBaseConfigV2();
  const plan = generatePlan(config).plan;
  const score = computePlanScore(plan, config);
  const lines = generatePlanSummary(plan, config, score);

  // Should have occupancy, repeats, matchup lines
  assert.ok(lines.length >= 3);

  const repeatLine = lines.find((l) => l.category === "repeats");
  assert.ok(repeatLine);
  if (score.repeatCount === 0) {
    assert.equal(repeatLine.severity, "good");
    assert.ok(repeatLine.text.includes("Geen herhalingen"));
  }
});

test("summary: basisschool preset has variety info", () => {
  const { config } = buildConfig({
    name: "Test",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 18,
    spellen: ["Voetbal", "Hockey", "Trefbal", "Volleybal", "Basketbal",
      "Touwtrekken", "Tikkertje", "Zaklopen", "Korfbal", "Tafeltennis"],
    locations: ["Veld 1", "Veld 2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "all-spellen",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
  });
  const plan = generatePlan(config).plan;
  const score = computePlanScore(plan, config);
  const lines = generatePlanSummary(plan, config, score);

  const varietyLine = lines.find((l) => l.category === "variety");
  assert.ok(varietyLine, "Should have a variety line");
  assert.ok(varietyLine.text.length > 0);
});

test("summary: matchup line present", () => {
  const config = createBaseConfigV2();
  const plan = generatePlan(config).plan;
  const score = computePlanScore(plan, config);
  const lines = generatePlanSummary(plan, config, score);

  const matchupLine = lines.find((l) => l.category === "matchup");
  assert.ok(matchupLine, "Should have a matchup line");
  assert.ok(matchupLine.text.includes("tegenstander"));
});

test("summary: pause activity shows bye info", () => {
  const { config } = buildConfig({
    name: "Bye test",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 10, // odd per pool → bye
    spellen: ["Voetbal", "Hockey", "Trefbal", "Volleybal"],
    locations: ["Veld 1", "Veld 2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
    pauseActivityName: "Puzzels & Quiz",
  });
  const plan = generatePlan(config).plan;
  const score = computePlanScore(plan, config);
  const lines = generatePlanSummary(plan, config, score);

  const byeLines = lines.filter((l) => l.category === "bye");
  assert.ok(byeLines.length >= 1, "Should have at least one bye line");

  // Should have the odd-pool warning
  const oddPoolLine = byeLines.find((l) => l.text.includes("oneven"));
  assert.ok(oddPoolLine, "Should warn about odd groups per pool");

  // Should have the pause activity info
  const pauseLine = byeLines.find((l) => l.text.includes("Puzzels & Quiz"));
  assert.ok(pauseLine, "Should show pause activity name");
  assert.equal(pauseLine.severity, "neutral");
});

test("summary: occupancy line present", () => {
  const config = createBaseConfigV2();
  const plan = generatePlan(config).plan;
  const score = computePlanScore(plan, config);
  const lines = generatePlanSummary(plan, config, score);

  const occLine = lines.find((l) => l.category === "occupancy");
  assert.ok(occLine, "Should have an occupancy line");
});
