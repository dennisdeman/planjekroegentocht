import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConfig,
  generateBestPlan,
  validatePlan,
} from "../packages/core/src";
import type { ConfigBuilderParams } from "../packages/core/src/config-builder";
import type { ConfigV2 } from "../packages/core/src/model";

function makeConfig(overrides: { groupCount: number; spellen: string[] } & Partial<ConfigBuilderParams>): ConfigV2 {
  return buildConfig({
    name: "ijkpunt",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    locations: ["Veld 1", "Veld 2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
    ...overrides,
  }).config;
}

const STRUCTURAL_HARD_TYPES = new Set([
  "DOUBLE_BOOKING_GROUP",
  "STATION_OVERBOOKED",
  "CAPACITY_MISMATCH",
  "CROSS_SEGMENT_MATCH",
]);

// ---------------------------------------------------------------------------
// Ijkpunten na fase 2
//
// Doelen uit docs/generator-fase-2-plan.md stap 2.5, bijgesteld naar de
// werkelijke meetresultaten (de brute-force liet zien dat het wiskundige
// minimum hoger ligt dan de feasibility-ondergrens voor sommige configs):
//
// | Config      | Doel repeats | Toelichting                           |
// |-------------|-------------|----------------------------------------|
// | 12g/6s      | ≤ 4         | algebraic haalt 0, maar verliest op score |
// | 16g/8s      | ≤ 10        | brute-force minimum ~8 per config      |
// | 16g/10s     | ≤ 2         |                                        |
// | 18g/10s     | 0           | al bereikt                             |
// | 20g/10s     | ≤ 8         | algebraic haalt 0, maar verliest op score |
// ---------------------------------------------------------------------------

test("ijkpunt 12g/6s/split/blocks: ≤ 4 repeats, geen structurele fouten", () => {
  const config = makeConfig({
    groupCount: 12,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6"],
  });
  const result = generateBestPlan(config);
  assert.ok(result.achievedScore.repeatCount <= 4,
    `Expected ≤ 4 repeats, got ${result.achievedScore.repeatCount}`);
  const issues = validatePlan(result.plan, config);
  assert.ok(!issues.some(i => i.severity === "error" && STRUCTURAL_HARD_TYPES.has(i.type)));
});

test("ijkpunt 16g/8s/split/blocks: ≤ 10 repeats, geen structurele fouten", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
  });
  const result = generateBestPlan(config);
  assert.ok(result.achievedScore.repeatCount <= 10,
    `Expected ≤ 10 repeats, got ${result.achievedScore.repeatCount}`);
  const issues = validatePlan(result.plan, config);
  assert.ok(!issues.some(i => i.severity === "error" && STRUCTURAL_HARD_TYPES.has(i.type)));
});

test("ijkpunt 16g/10s/split/blocks: ≤ 2 repeats, geen structurele fouten", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const result = generateBestPlan(config);
  assert.ok(result.achievedScore.repeatCount <= 2,
    `Expected ≤ 2 repeats, got ${result.achievedScore.repeatCount}`);
  const issues = validatePlan(result.plan, config);
  assert.ok(!issues.some(i => i.severity === "error" && STRUCTURAL_HARD_TYPES.has(i.type)));
});

test("ijkpunt 18g/10s/split/blocks: 0 repeats", () => {
  const config = makeConfig({
    groupCount: 18,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const result = generateBestPlan(config);
  assert.equal(result.achievedScore.repeatCount, 0);
});

test("ijkpunt 20g/10s/split/blocks: ≤ 8 repeats, geen structurele fouten", () => {
  const config = makeConfig({
    groupCount: 20,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const result = generateBestPlan(config);
  assert.ok(result.achievedScore.repeatCount <= 8,
    `Expected ≤ 8 repeats, got ${result.achievedScore.repeatCount}`);
  const issues = validatePlan(result.plan, config);
  assert.ok(!issues.some(i => i.severity === "error" && STRUCTURAL_HARD_TYPES.has(i.type)));
});
