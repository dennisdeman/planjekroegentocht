import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePlanFeasibility,
  buildConfig,
  STRATEGY_REGISTRY,
  algebraicStrategy,
  pairedRotationStrategy,
  roundRobinExactStrategy,
  roundRobinSlotStrategy,
  validatePlan,
  hasHardErrors,
  totalRepeatPenalty,
} from "../packages/core/src";
import type { ConfigBuilderParams } from "../packages/core/src/config-builder";
import type { ConfigV2 } from "../packages/core/src/model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STRUCTURAL_HARD_TYPES = new Set([
  "DOUBLE_BOOKING_GROUP",
  "STATION_OVERBOOKED",
  "CAPACITY_MISMATCH",
  "CROSS_SEGMENT_MATCH",
]);

function hasStructuralHardErrors(issues: Array<{ type: string; severity: string }>): boolean {
  return issues.some(
    (i) => i.severity === "error" && STRUCTURAL_HARD_TYPES.has(i.type)
  );
}

function makeConfig(overrides: Partial<ConfigBuilderParams> = {}): ConfigV2 {
  return buildConfig({
    name: "test",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 12,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6"],
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

// ---------------------------------------------------------------------------
// Registry sanity
// ---------------------------------------------------------------------------

test("STRATEGY_REGISTRY contains all active strategies", () => {
  assert.equal(STRATEGY_REGISTRY.length, 6);
  assert.deepEqual(
    STRATEGY_REGISTRY.map((s) => s.name),
    ["algebraic", "paired-rotation", "single-pool-rotation", "shuffled-rounds", "round-robin-exact", "round-robin-slot"]
  );
});

// ---------------------------------------------------------------------------
// algebraicStrategy
// ---------------------------------------------------------------------------

test("algebraic: applicable for 12g/6s/split/blocks (H=3, nice H)", () => {
  const config = makeConfig({ groupCount: 12, spellen: ["S1", "S2", "S3", "S4", "S5", "S6"] });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(algebraicStrategy.applicable(config, feasibility), true);
});

test("algebraic: not applicable for 16g/8s (H=4, bad H)", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(algebraicStrategy.applicable(config, feasibility), false);
});

test("algebraic: not applicable for free mode", () => {
  const config = makeConfig({
    usePools: false,
    poolNames: [],
    groupCount: 6,
    spellen: ["S1", "S2", "S3"],
    locations: ["Veld 1"],
    movementPolicy: "free",
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(algebraicStrategy.applicable(config, feasibility), false);
});

test("algebraic: not applicable for odd pool", () => {
  const config = makeConfig({
    groupCount: 18,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(algebraicStrategy.applicable(config, feasibility), false);
});

test("algebraic: generate returns valid plan for 12g/6s", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  const attempt = algebraicStrategy.generate(config, feasibility);
  assert.ok(attempt, "should produce a plan");
  assert.equal(attempt.strategyName, "algebraic");
  assert.ok(attempt.plan.allocations.length > 0);

  // Algebraic plan should have 0 repeat penalty
  const repeats = totalRepeatPenalty(attempt.plan, config);
  assert.equal(repeats, 0, "algebraic should produce 0 spel repeats");

  // No structural hard errors (DUPLICATE_MATCHUP is verwacht — algebraic
  // genereert eigen matches, niet de standaard round-robin)
  const issues = validatePlan(attempt.plan, config);
  assert.equal(hasStructuralHardErrors(issues), false);
});

test("algebraic: generate returns null when not applicable", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
  });
  const feasibility = analyzePlanFeasibility(config);
  const attempt = algebraicStrategy.generate(config, feasibility);
  assert.equal(attempt, null);
});

// ---------------------------------------------------------------------------
// pairedRotationStrategy
// ---------------------------------------------------------------------------

// --- Positieve tests (bewezen werkend) ---

test("paired-rotation: applicable for 16g/8s/split/blocks/all-spellen (H=4, no algebraic)", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
    scheduleMode: "all-spellen",
  });
  const feasibility = analyzePlanFeasibility(config);
  // 8 per pool, H=4, hasAlgebraicK(4)=false => paired-rotation applicable
  assert.equal(pairedRotationStrategy.applicable(config, feasibility), true);
});

test("paired-rotation: not applicable for round-robin mode", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
    scheduleMode: "round-robin",
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(pairedRotationStrategy.applicable(config, feasibility), false);
});

test("paired-rotation: generate valid plan for 16g/8s/2pools (0 spel repeats)", () => {
  const config = makeConfig({
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
    scheduleMode: "all-spellen",
  });
  const feasibility = analyzePlanFeasibility(config);
  const attempt = pairedRotationStrategy.generate(config, feasibility);
  assert.ok(attempt, "should produce a plan");
  assert.equal(attempt.strategyName, "paired-rotation");
  assert.ok(attempt.plan.allocations.length > 0);

  const issues = validatePlan(attempt.plan, config);
  assert.equal(hasStructuralHardErrors(issues), false);

  const repeats = totalRepeatPenalty(attempt.plan, config);
  assert.equal(repeats, 0, "paired-rotation 16g/8s should achieve 0 spel repeats");
});

// --- Negatieve tests (bewezen onmogelijk / niet van toepassing) ---

test("paired-rotation: not applicable for 6g/3s (algebraic handles H=3)", () => {
  const config = makeConfig({
    groupCount: 12,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6"],
    scheduleMode: "all-spellen",
  });
  const feasibility = analyzePlanFeasibility(config);
  // H=3 is nice-H, algebraic is applicable => paired-rotation skips
  assert.equal(pairedRotationStrategy.applicable(config, feasibility), false);
});

test("paired-rotation: not applicable for odd pool (18g = 9/pool)", () => {
  const config = makeConfig({
    groupCount: 18,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
    scheduleMode: "all-spellen",
  });
  const feasibility = analyzePlanFeasibility(config);
  // 9 per pool = oneven, niet applicable
  assert.equal(pairedRotationStrategy.applicable(config, feasibility), false);
});

test("paired-rotation: not applicable for free mode", () => {
  const config = makeConfig({
    usePools: false,
    poolNames: [],
    groupCount: 8,
    spellen: ["S1", "S2", "S3", "S4"],
    locations: ["Veld 1"],
    movementPolicy: "free",
    scheduleMode: "all-spellen",
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(pairedRotationStrategy.applicable(config, feasibility), false);
});

test("paired-rotation: not applicable for small pool (4g = G < 6)", () => {
  const config = makeConfig({
    groupCount: 8,
    spellen: ["S1", "S2", "S3", "S4"],
    scheduleMode: "all-spellen",
  });
  const feasibility = analyzePlanFeasibility(config);
  // 4 per pool, G < 6
  assert.equal(pairedRotationStrategy.applicable(config, feasibility), false);
});

// ---------------------------------------------------------------------------
// roundRobinExactStrategy
// ---------------------------------------------------------------------------

test("round-robin-exact: applicable for blocks mode with locationBlocks", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(roundRobinExactStrategy.applicable(config, feasibility), true);
});

test("round-robin-exact: not applicable for free mode", () => {
  const config = makeConfig({
    usePools: false,
    poolNames: [],
    groupCount: 6,
    spellen: ["S1", "S2", "S3"],
    locations: ["Veld 1"],
    movementPolicy: "free",
  });
  const feasibility = analyzePlanFeasibility(config);
  assert.equal(roundRobinExactStrategy.applicable(config, feasibility), false);
});

test("round-robin-exact: generate returns valid plan for 12g/6s/blocks", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  const attempt = roundRobinExactStrategy.generate(config, feasibility);
  assert.ok(attempt, "should produce a plan");
  assert.equal(attempt.strategyName, "round-robin-exact");
  assert.ok(attempt.plan.allocations.length > 0);

  const issues = validatePlan(attempt.plan, config);
  assert.equal(hasHardErrors(issues), false);
});

// ---------------------------------------------------------------------------
// roundRobinSlotStrategy
// ---------------------------------------------------------------------------

test("round-robin-slot: always applicable (universal fallback)", () => {
  const configs = [
    makeConfig(),
    makeConfig({
      usePools: false,
      poolNames: [],
      groupCount: 6,
      spellen: ["S1", "S2", "S3"],
      locations: ["Veld 1"],
      movementPolicy: "free",
    }),
    makeConfig({ groupCount: 8, spellen: ["S1", "S2", "S3", "S4"] }),
  ];
  for (const config of configs) {
    const feasibility = analyzePlanFeasibility(config);
    assert.equal(
      roundRobinSlotStrategy.applicable(config, feasibility),
      true,
      `should be applicable for ${config.name}`
    );
  }
});

test("round-robin-slot: generate returns valid plan for free mode", () => {
  const config = makeConfig({
    usePools: false,
    poolNames: [],
    groupCount: 6,
    spellen: ["S1", "S2", "S3"],
    locations: ["Veld 1"],
    movementPolicy: "free",
  });
  const feasibility = analyzePlanFeasibility(config);
  const attempt = roundRobinSlotStrategy.generate(config, feasibility);
  assert.ok(attempt, "should produce a plan");
  assert.equal(attempt.strategyName, "round-robin-slot");
  assert.ok(attempt.plan.allocations.length > 0);

  const issues = validatePlan(attempt.plan, config);
  assert.equal(hasHardErrors(issues), false);
});

test("round-robin-slot: generate returns valid plan for blocks mode", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);
  const attempt = roundRobinSlotStrategy.generate(config, feasibility);
  assert.ok(attempt, "should produce a plan");
  assert.ok(attempt.plan.allocations.length > 0);

  const issues = validatePlan(attempt.plan, config);
  assert.equal(hasHardErrors(issues), false);
});

// ---------------------------------------------------------------------------
// Cross-strategy: alle applicable strategieën produceren structureel
// geldige plannen voor de ijkpunten
// ---------------------------------------------------------------------------
//
// NB: we checken hier alleen structurele hard errors (double-booking,
// overbooked, capacity, cross-segment). DUPLICATE_MATCHUP is een
// verwacht gevolg van de algebraïsche constructie (die eigen matches
// genereert, niet de standaard round-robin). De orchestrator in stap 1.5
// scoort en vergelijkt — DUPLICATE_MATCHUP is daar een gewogen penalty,
// niet een reden om het plan weg te gooien. Zie design §3.5.

test("all applicable strategies produce structurally valid plans for 12g/6s/split/blocks", () => {
  const config = makeConfig();
  const feasibility = analyzePlanFeasibility(config);

  for (const strategy of STRATEGY_REGISTRY) {
    if (!strategy.applicable(config, feasibility)) continue;
    const attempt = strategy.generate(config, feasibility);
    assert.ok(attempt, `${strategy.name} should produce a plan`);
    assert.equal(attempt.strategyName, strategy.name);
    assert.ok(
      attempt.plan.allocations.length > 0,
      `${strategy.name} should have allocations`
    );
    const issues = validatePlan(attempt.plan, config);
    assert.equal(
      hasStructuralHardErrors(issues),
      false,
      `${strategy.name} should produce no structural hard errors`
    );
  }
});

test("all applicable strategies produce structurally valid plans for 20g/10s/split/blocks", () => {
  const config = makeConfig({
    groupCount: 20,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
  });
  const feasibility = analyzePlanFeasibility(config);

  for (const strategy of STRATEGY_REGISTRY) {
    if (!strategy.applicable(config, feasibility)) continue;
    const attempt = strategy.generate(config, feasibility);
    assert.ok(attempt, `${strategy.name} should produce a plan`);
    const issues = validatePlan(attempt.plan, config);
    assert.equal(
      hasStructuralHardErrors(issues),
      false,
      `${strategy.name} should produce no structural hard errors`
    );
  }
});
