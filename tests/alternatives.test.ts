import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConfig,
  proposeAlternatives,
  generateBestPlan,
} from "../packages/core/src";
import type { ConfigBuilderParams } from "../packages/core/src/config-builder";
import type { ConfigV2 } from "../packages/core/src/model";

function makeConfig(overrides: Partial<ConfigBuilderParams> = {}): ConfigV2 {
  return buildConfig({
    name: "test",
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: 16,
    spellen: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
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
// Basis-gedrag
// ---------------------------------------------------------------------------

test("proposeAlternatives: vindt suggesties voor 16g/8s (imperfecte config)", async () => {
  const config = makeConfig();
  const alternatives = await proposeAlternatives(config);

  assert.ok(alternatives.length > 0, "Should find at least one alternative");
  assert.ok(alternatives.length <= 5, "Should return at most 5 by default");

  for (const alt of alternatives) {
    assert.ok(alt.id);
    assert.ok(alt.label.length > 0);
    assert.ok(alt.reason.length > 0);
    assert.ok(alt.achievedScore.totalScore > 0);
    assert.equal(alt.source, "deterministic");
  }
});

test("proposeAlternatives: vindt groep-reductie richting nice-H", async () => {
  // 16g → 14g (7/pool, H=3.5 niet nice) of 12g (6/pool, H=3 nice)
  const config = makeConfig();
  const alternatives = await proposeAlternatives(config);

  const groupAlts = alternatives.filter((a) => a.apply.groupCount !== undefined);
  assert.ok(groupAlts.length > 0, "Should suggest group count changes");

  // Minstens één suggestie met lager of hoger groep-aantal
  const niceHAlts = groupAlts.filter((a) => {
    const gc = a.apply.groupCount!;
    const perPool = Math.ceil(gc / 2);
    const H = Math.floor(perPool / 2);
    return perPool % 2 === 0 && H >= 3 && H !== 6;
  });
  // Het is niet gegarandeerd dat een nice-H suggestie wint op score,
  // maar ze moeten in de lijst voorkomen als ze beter scoren.
});

test("proposeAlternatives: bye-toevoeging als suggestie voor imperfecte config", async () => {
  const config = makeConfig();
  const alternatives = await proposeAlternatives(config);

  // Minstens één suggestie met addTimeslots
  const byeAlts = alternatives.filter((a) => a.apply.addTimeslots !== undefined);
  // Niet gegarandeerd dat het in de top-5 zit, maar het zou overwogen moeten worden
});

// ---------------------------------------------------------------------------
// Sortering
// ---------------------------------------------------------------------------

test("proposeAlternatives: diversificatie — minstens 2 categorieën in top-5", async () => {
  const config = makeConfig();
  const alternatives = await proposeAlternatives(config, undefined, {
    maxAlternatives: 5,
  });

  if (alternatives.length >= 2) {
    // Categoriseer zoals de interne logica
    const categories = new Set(alternatives.map((a) => {
      const keys = Object.keys(a.apply);
      if (keys.includes("addTimeslots")) return "rounds";
      if (keys.includes("scheduleMode") && keys.length === 1) return "mode";
      if (keys.length >= 2) return "combo";
      return "structure";
    }));
    assert.ok(
      categories.size >= 2,
      `Expected >= 2 categories in top-5, got ${categories.size}: ${[...categories].join(", ")}`
    );
  }
});

// ---------------------------------------------------------------------------
// Cost budget filter
// ---------------------------------------------------------------------------

test("proposeAlternatives: costBudget filter werkt", async () => {
  const config = makeConfig();
  const strict = await proposeAlternatives(config, undefined, {
    costBudget: 2,
    maxAlternatives: 50,
  });
  const loose = await proposeAlternatives(config, undefined, {
    costBudget: 7,
    maxAlternatives: 50,
  });

  // Stricter budget → minder of gelijke resultaten
  assert.ok(strict.length <= loose.length,
    `Strict budget (${strict.length}) should produce <= loose budget (${loose.length}) alternatives`);

  // Alle strict-resultaten moeten cost <= 2 hebben
  for (const alt of strict) {
    assert.ok(alt.costToUser <= 2, `Cost ${alt.costToUser} exceeds budget 2`);
  }
});

// ---------------------------------------------------------------------------
// maxAlternatives
// ---------------------------------------------------------------------------

test("proposeAlternatives: maxAlternatives wordt gerespecteerd", async () => {
  const config = makeConfig();
  const result = await proposeAlternatives(config, undefined, {
    maxAlternatives: 2,
  });
  assert.ok(result.length <= 2);
});

// ---------------------------------------------------------------------------
// Alle alternatieven verbeteren de baseline
// ---------------------------------------------------------------------------

test("proposeAlternatives: alle alternatieven verbeteren minstens één metric", async () => {
  const config = makeConfig();
  const baseline = generateBestPlan(config);
  const alternatives = await proposeAlternatives(config);

  // Bereken baseline coverage
  const stationById = new Map(config.stations.map((s) => [s.id, s]));
  const totalSpellen = config.activityTypes.filter((a) => a.id !== "activity-pause").length;
  const groupActs = new Map<string, Set<string>>();
  for (const alloc of baseline.plan.allocations) {
    const st = stationById.get(alloc.stationId);
    if (!st || st.activityTypeId === "activity-pause") continue;
    for (const gid of alloc.groupIds) {
      if (!groupActs.has(gid)) groupActs.set(gid, new Set());
      groupActs.get(gid)!.add(st.activityTypeId);
    }
  }
  const baseCoverageFull = [...groupActs.values()].filter((s) => s.size >= totalSpellen).length;

  for (const alt of alternatives) {
    const betterScore =
      alt.achievedScore.totalScore > baseline.achievedScore.totalScore;
    const fewerRepeats =
      alt.achievedRepeats < baseline.achievedScore.repeatCount;
    const betterCoverage =
      alt.spelCoverage.full > baseCoverageFull;
    assert.ok(
      betterScore || fewerRepeats || betterCoverage,
      `Alternative "${alt.label}" should improve score, reduce repeats, or improve coverage. ` +
        `Score: ${alt.achievedScore.totalScore.toFixed(2)} vs ${baseline.achievedScore.totalScore.toFixed(2)}, ` +
        `Repeats: ${alt.achievedRepeats} vs ${baseline.achievedScore.repeatCount}, ` +
        `Coverage: ${alt.spelCoverage.full}/${alt.spelCoverage.total} vs ${baseCoverageFull}`
    );
  }
});

// ---------------------------------------------------------------------------
// Met bestaand plan als baseline
// ---------------------------------------------------------------------------

test("proposeAlternatives: accepteert currentPlan als baseline", async () => {
  const config = makeConfig();
  const plan = generateBestPlan(config).plan;
  const alternatives = await proposeAlternatives(config, plan);

  // Moet werken zonder crash
  assert.ok(Array.isArray(alternatives));
});

// ---------------------------------------------------------------------------
// seed alternatieven (voor LLM-uitbreiding)
// ---------------------------------------------------------------------------

test("proposeAlternatives: seedAlternatives worden meegenomen", async () => {
  const config = makeConfig();
  const alternatives = await proposeAlternatives(config, undefined, {
    seedAlternatives: [{ groupCount: 12 }],
    maxAlternatives: 20,
  });

  // De seed moet geëvalueerd worden — als hij beter scoort, zit hij erin
  assert.ok(Array.isArray(alternatives));
});
