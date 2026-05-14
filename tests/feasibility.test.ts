import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePlanFeasibility,
  buildConfig,
  hasAlgebraicK,
} from "../packages/core/src";
import type { ConfigBuilderParams } from "../packages/core/src/config-builder";
import type { ConfigV2, ScheduleMode } from "../packages/core/src/model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
//
// Per-ijkpunt expected values are HAND-DERIVED uit de wiskunde van
// `calculateSchedule` + de blok-toewijzing die `buildConfig` aanmaakt.
// Een brute-force `feasibility-brute-force.fixture.ts` (zoals voorgesteld
// in `docs/generator-fase-1-plan.md` stap 1.1) is bewust uitgesteld:
// hand-afleidingen zijn voor deze formule (`max(0, matches − reachable)`)
// goed te volgen, en de brute-force fixture krijgt pas waarde als de
// implementatie stabiel is. Zie de TODO onderaan dit bestand.

interface IjkpuntCase {
  name: string;
  groupCount: number;
  poolCount: number;
  spellen: number;
  locations: number;
  layout: "split" | "same";
  scheduleMode: ScheduleMode;
}

function buildIjkpunt(c: IjkpuntCase): ConfigV2 {
  const params: ConfigBuilderParams = {
    name: c.name,
    usePools: c.poolCount > 1,
    poolNames: Array.from({ length: c.poolCount }, (_, i) => `Pool ${String.fromCharCode(65 + i)}`),
    groupCount: c.groupCount,
    spellen: Array.from({ length: c.spellen }, (_, i) => `Spel ${i + 1}`),
    locations: Array.from({ length: c.locations }, (_, i) => `Veld ${i + 1}`),
    movementPolicy: "blocks",
    stationLayout: c.layout,
    scheduleMode: c.scheduleMode,
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
  };
  return buildConfig(params).config;
}

// ---------------------------------------------------------------------------
// `hasAlgebraicK` — gedeelde helper, los getest
// ---------------------------------------------------------------------------

test("hasAlgebraicK: H<3 of H===6 → false", () => {
  assert.equal(hasAlgebraicK(0), false);
  assert.equal(hasAlgebraicK(1), false);
  assert.equal(hasAlgebraicK(2), false);
  assert.equal(hasAlgebraicK(6), false);
});

test("hasAlgebraicK: H=3,5,7,9,11 → true (de 'nice H' waarden)", () => {
  assert.equal(hasAlgebraicK(3), true);  // k=2
  assert.equal(hasAlgebraicK(5), true);  // k=2
  assert.equal(hasAlgebraicK(7), true);  // k=2
  assert.equal(hasAlgebraicK(9), true);  // k=2
  assert.equal(hasAlgebraicK(11), true); // k=2
});

test("hasAlgebraicK: H=4,8,10 → false (geen geldige k)", () => {
  // H=4: k∈[2,3]. k=2 gcd(2,4)=2. k=3 gcd(2,4)=2.
  assert.equal(hasAlgebraicK(4), false);
  // H=8: alle even k vallen op gcd(k,8)>1; oneven k geven gcd(k-1,8)>1.
  assert.equal(hasAlgebraicK(8), false);
  // H=10: zelfde patroon.
  assert.equal(hasAlgebraicK(10), false);
});

// ---------------------------------------------------------------------------
// Ijkpunten — zie `docs/generator-design.md` §10
// ---------------------------------------------------------------------------
//
// Voor elke ijkpunt volgt eerst de wiskundige redenering, dan de assertie.
// Waar mijn computatie afwijkt van de verwachting in de plan-tabel
// (`docs/generator-fase-1-plan.md` stap 1.1), staat dat expliciet
// gemarkeerd als PLAN-INCONSISTENTIE.

test("ijkpunt 8g/4s/split/blocks/2loc (all-spellen): 0 herhalingen, geen algebraic", () => {
  // Wiskunde:
  //  - poolSize=4, all-spellen met 4 spellen/2locs/split → roundsForAllSpellen = ceil(4/2)*2 = 4
  //  - matchesPerGroup = 4 (= aantal actieve slots)
  //  - 2 blokken (break na slot 2): block1 → loc0 (2 spellen), block2 → loc1 (2 spellen)
  //  - reachable over beide blokken = 4 unieke spellen
  //  - lowerBound per groep = max(0, 4 − 4) = 0
  //  - algebraicFeasible: H=4/2=2 < 3 → false
  const config = buildIjkpunt({
    name: "8g/4s",
    groupCount: 8,
    poolCount: 2,
    spellen: 4,
    locations: 2,
    layout: "split",
    scheduleMode: "all-spellen",
  });
  const report = analyzePlanFeasibility(config);
  assert.equal(report.mode, "all-spellen");
  assert.equal(report.segments.length, 2);
  assert.equal(report.totalLowerBoundSpelRepeats, 0);
  for (const seg of report.segments) {
    assert.equal(seg.groupCount, 4);
    assert.equal(seg.matchesPerGroup, 4);
    assert.equal(seg.reachableActivityTypes, 4);
    assert.equal(seg.lowerBoundSpelRepeats, 0);
    assert.equal(seg.algebraicFeasible, false);
    assert.equal(seg.byeAssistancePossible, false);
    // matchupCeiling = ceil(4 / (4-1)) = ceil(4/3) = 2
    assert.equal(seg.lowerBoundMatchupCeiling, 2);
  }
});

test("ijkpunt 10g/5s/split/blocks/2loc (round-robin): 0 herhalingen, geen algebraic (oneven pool)", () => {
  // Wiskunde:
  //  - poolSize=5, round-robin → roundsNeeded = 4 (poolSize − 1)
  //  - matchesPerGroup = 4 (v1: aantal actieve slots; oneven pool overschat met 1)
  //  - 5 spellen / 2 locs / split: perLoc=ceil(5/2)=3 → loc0 heeft 3 stations, loc1 heeft 2
  //  - 2 blokken: block1 → loc0 (3 spellen), block2 → loc1 (2 spellen)
  //  - reachable = 5
  //  - lowerBound per groep = max(0, 4 − 5) = 0
  //  - algebraicFeasible: groupCount=5 oneven → false
  const config = buildIjkpunt({
    name: "10g/5s",
    groupCount: 10,
    poolCount: 2,
    spellen: 5,
    locations: 2,
    layout: "split",
    scheduleMode: "round-robin",
  });
  const report = analyzePlanFeasibility(config);
  assert.equal(report.mode, "round-robin");
  assert.equal(report.totalLowerBoundSpelRepeats, 0);
  for (const seg of report.segments) {
    assert.equal(seg.groupCount, 5);
    assert.equal(seg.matchesPerGroup, 4);
    assert.equal(seg.reachableActivityTypes, 5);
    assert.equal(seg.lowerBoundSpelRepeats, 0);
    assert.equal(seg.algebraicFeasible, false);
    // matchupCeiling = ceil(4 / (5-1)) = 1
    assert.equal(seg.lowerBoundMatchupCeiling, 1);
  }
});

test("ijkpunt 12g/6s/split/blocks/2loc (round-robin): 0 herhalingen, algebraic werkt (H=3)", () => {
  // Wiskunde:
  //  - poolSize=6, round-robin → roundsNeeded = 5
  //  - matchesPerGroup = 5
  //  - 6 spellen / 2 locs / split: perLoc=3, beide locaties 3 stations
  //  - 2 blokken: block1 → loc0 (3 spellen), block2 → loc1 (3 spellen)
  //  - reachable = 6
  //  - lowerBound = max(0, 5 − 6) = 0
  //  - algebraicFeasible: H=3, hasAlgebraicK(3)=true, stations/loc=3≥H ✓ → true
  const config = buildIjkpunt({
    name: "12g/6s",
    groupCount: 12,
    poolCount: 2,
    spellen: 6,
    locations: 2,
    layout: "split",
    scheduleMode: "round-robin",
  });
  const report = analyzePlanFeasibility(config);
  assert.equal(report.totalLowerBoundSpelRepeats, 0);
  for (const seg of report.segments) {
    assert.equal(seg.groupCount, 6);
    assert.equal(seg.matchesPerGroup, 5);
    assert.equal(seg.reachableActivityTypes, 6);
    assert.equal(seg.lowerBoundSpelRepeats, 0);
    assert.equal(seg.algebraicFeasible, true);
    // matchupCeiling = ceil(5 / 5) = 1
    assert.equal(seg.lowerBoundMatchupCeiling, 1);
  }
});

test("ijkpunt 16g/8s/split/blocks/2loc (round-robin): 0 herhalingen wiskundig, geen algebraic (H=4)", () => {
  // Wiskunde:
  //  - poolSize=8, round-robin → roundsNeeded = 7
  //  - matchesPerGroup = 7
  //  - 8 spellen / 2 locs / split: perLoc=4, beide locs 4 stations
  //  - 2 blokken alternerend: pool 0 ziet loc0 (4 spellen) + loc1 (4 spellen) = 8 reachable
  //  - lowerBound = max(0, 7 − 8) = 0
  //
  // PLAN-INCONSISTENTIE: docs/generator-fase-1-plan.md stap 1.1 tabel zegt
  // hier "> 0 (8 matches, 4 reachable)". Dat is niet wat de standaard
  // buildConfig-output produceert: bij 2 pools en 2 locaties wisselen
  // de pools van locatie tussen blok 1 en blok 2 (zie config-builder.ts
  // segmentLocationMap), waardoor reachable = 8, niet 4. Het wiskundige
  // minimum is 0; dat strategieën dit in praktijk niet altijd halen
  // (design §10: "verwacht minimum 4 per blok") is een strategie-zorg,
  // niet een feasibility-zorg.
  //
  //  - algebraicFeasible: H=8/2=4, hasAlgebraicK(4)=false → false
  const config = buildIjkpunt({
    name: "16g/8s",
    groupCount: 16,
    poolCount: 2,
    spellen: 8,
    locations: 2,
    layout: "split",
    scheduleMode: "round-robin",
  });
  const report = analyzePlanFeasibility(config);
  assert.equal(report.totalLowerBoundSpelRepeats, 0);
  for (const seg of report.segments) {
    assert.equal(seg.groupCount, 8);
    assert.equal(seg.matchesPerGroup, 7);
    assert.equal(seg.reachableActivityTypes, 8);
    assert.equal(seg.lowerBoundSpelRepeats, 0);
    assert.equal(seg.algebraicFeasible, false);
    // matchupCeiling = ceil(7 / 7) = 1
    assert.equal(seg.lowerBoundMatchupCeiling, 1);
  }
});

test("ijkpunt 18g/10s/split/blocks/2loc (round-robin): 0 herhalingen wiskundig, geen algebraic (oneven pool)", () => {
  // Wiskunde:
  //  - poolSize=9, round-robin → roundsNeeded = 8
  //  - matchesPerGroup = 8 (v1 overschat oneven pools met 1)
  //  - 10 spellen / 2 locs / split: perLoc=5, beide locs 5 stations
  //  - reachable over 2 blokken = 10
  //  - lowerBound = max(0, 8 − 10) = 0
  //
  // PLAN-INCONSISTENTIE: dezelfde tabel zegt "> 0 (oneven pool)". Maar
  // "oneven pool" gaat over de algebraic-haalbaarheid, niet over
  // spel-herhalingen — er zijn voldoende unieke spellen bereikbaar.
  //
  //  - algebraicFeasible: groupCount=9 oneven → false
  const config = buildIjkpunt({
    name: "18g/10s",
    groupCount: 18,
    poolCount: 2,
    spellen: 10,
    locations: 2,
    layout: "split",
    scheduleMode: "round-robin",
  });
  const report = analyzePlanFeasibility(config);
  assert.equal(report.totalLowerBoundSpelRepeats, 0);
  for (const seg of report.segments) {
    assert.equal(seg.groupCount, 9);
    assert.equal(seg.matchesPerGroup, 8);
    assert.equal(seg.reachableActivityTypes, 10);
    assert.equal(seg.lowerBoundSpelRepeats, 0);
    assert.equal(seg.algebraicFeasible, false);
    // matchupCeiling = ceil(8 / (9-1)) = 1
    assert.equal(seg.lowerBoundMatchupCeiling, 1);
  }
});

test("ijkpunt 20g/10s/split/blocks/2loc (round-robin): 0 herhalingen, algebraic werkt (H=5)", () => {
  // Wiskunde:
  //  - poolSize=10, round-robin → roundsNeeded = 9
  //  - matchesPerGroup = 9
  //  - 10 spellen / 2 locs / split: perLoc=5, beide locs 5 stations
  //  - reachable over 2 blokken = 10
  //  - lowerBound = max(0, 9 − 10) = 0
  //  - algebraicFeasible: H=5, hasAlgebraicK(5)=true, stations/loc=5≥H ✓ → true
  const config = buildIjkpunt({
    name: "20g/10s",
    groupCount: 20,
    poolCount: 2,
    spellen: 10,
    locations: 2,
    layout: "split",
    scheduleMode: "round-robin",
  });
  const report = analyzePlanFeasibility(config);
  assert.equal(report.totalLowerBoundSpelRepeats, 0);
  for (const seg of report.segments) {
    assert.equal(seg.groupCount, 10);
    assert.equal(seg.matchesPerGroup, 9);
    assert.equal(seg.reachableActivityTypes, 10);
    assert.equal(seg.lowerBoundSpelRepeats, 0);
    assert.equal(seg.algebraicFeasible, true);
    // matchupCeiling = ceil(9 / 9) = 1
    assert.equal(seg.lowerBoundMatchupCeiling, 1);
  }
});

// ---------------------------------------------------------------------------
// Edge cases waar lowerBound > 0 — om de formule en messages te verifiëren
// ---------------------------------------------------------------------------

test("8 groepen / 3 spellen / free: lowerBound > 0 (te weinig spellen)", () => {
  // Wiskunde:
  //  - 8 groepen, 1 pool, free, 1 loc, 3 spellen
  //  - roundsNeeded round-robin = 7
  //  - matchesPerGroup = 7
  //  - reachable = 3 (alle spellen)
  //  - lowerBound per groep = max(0, 7 − 3) = 4
  //  - totaal segment = 4 × 8 = 32
  //  - byeAssistancePossible: lb>0, even pool, geen pauseActivity → false
  const config = buildConfig({
    name: "te weinig spellen",
    usePools: false,
    poolNames: [],
    groupCount: 8,
    spellen: ["A", "B", "C"],
    locations: ["L1"],
    movementPolicy: "free",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 0,
    repeatPolicy: "soft",
  }).config;

  const report = analyzePlanFeasibility(config);
  assert.equal(report.mode, "round-robin");
  assert.equal(report.segments.length, 1);
  const seg = report.segments[0];
  assert.equal(seg.groupCount, 8);
  assert.equal(seg.matchesPerGroup, 7);
  assert.equal(seg.reachableActivityTypes, 3);
  assert.equal(seg.lowerBoundSpelRepeats, 32);
  assert.equal(seg.algebraicFeasible, false);
  assert.equal(seg.byeAssistancePossible, false);
  assert.equal(report.totalLowerBoundSpelRepeats, 32);

  // Message moet de tekortkoming benoemen.
  const obstructionMessage = report.messages.find((m) => m.includes("herhaling"));
  assert.ok(obstructionMessage, "verwacht een herhalings-bericht");
  assert.match(obstructionMessage!, /7 spelletjes/);
  assert.match(obstructionMessage!, /3 unieke spellen/);
  assert.match(obstructionMessage!, /32 totaal/);
});

test("byeAssistancePossible: pauseActivity aanwezig + even pool + niet algebraic", () => {
  // Zelfde config als hierboven, maar met expliciete pauseActivity post-build
  // (buildConfig voegt 'm alleen toe bij oneven pools / hasBye).
  const config = buildConfig({
    name: "met pauze",
    usePools: false,
    poolNames: [],
    groupCount: 8,
    spellen: ["A", "B", "C"],
    locations: ["L1"],
    movementPolicy: "free",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 0,
    repeatPolicy: "soft",
  }).config;
  config.pauseActivity = { name: "Rust" };

  const report = analyzePlanFeasibility(config);
  const seg = report.segments[0];
  assert.equal(seg.byeAssistancePossible, true);

  // Message bevat de bye-hint
  const obstructionMessage = report.messages.find((m) => m.includes("herhaling"));
  assert.match(obstructionMessage!, /pauze-activiteit/);
});

test("byeAssistancePossible: oneven pool → false (al ingebouwde bye)", () => {
  // 9g free 3 spellen met pauseActivity. Oneven pool → byeAssistance false
  // ondanks pauseActivity en lb>0 (heuristiek-keuze, zie commentaar in
  // computeByeAssistancePossible).
  const config = buildConfig({
    name: "oneven pool",
    usePools: false,
    poolNames: [],
    groupCount: 9,
    spellen: ["A", "B", "C"],
    locations: ["L1"],
    movementPolicy: "free",
    stationLayout: "split",
    scheduleMode: "round-robin",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 0,
    repeatPolicy: "soft",
  }).config;
  config.pauseActivity = { name: "Rust" };

  const report = analyzePlanFeasibility(config);
  const seg = report.segments[0];
  assert.ok(seg.lowerBoundSpelRepeats > 0);
  assert.equal(seg.byeAssistancePossible, false);
});

test("messages: bij 0 obstructie krijgt het rapport een 'geen obstructie' bericht", () => {
  const config = buildIjkpunt({
    name: "12g/6s",
    groupCount: 12,
    poolCount: 2,
    spellen: 6,
    locations: 2,
    layout: "split",
    scheduleMode: "round-robin",
  });
  const report = analyzePlanFeasibility(config);
  assert.equal(report.totalLowerBoundSpelRepeats, 0);
  assert.equal(report.messages.length, 1);
  assert.match(report.messages[0], /Geen wiskundige obstructie/);
});

test("modus wordt direct uit scheduleSettings gelezen — geen afleiding", () => {
  // Zelfde structurele config, twee verschillende modi → twee verschillende
  // mode-velden in het rapport. Bewijst dat de functie het veld leest in
  // plaats van het uit andere velden af te leiden.
  const allSpellen = buildIjkpunt({
    name: "modus-test-as",
    groupCount: 12,
    poolCount: 2,
    spellen: 6,
    locations: 2,
    layout: "split",
    scheduleMode: "all-spellen",
  });
  const roundRobin = buildIjkpunt({
    name: "modus-test-rr",
    groupCount: 12,
    poolCount: 2,
    spellen: 6,
    locations: 2,
    layout: "split",
    scheduleMode: "round-robin",
  });
  assert.equal(analyzePlanFeasibility(allSpellen).mode, "all-spellen");
  assert.equal(analyzePlanFeasibility(roundRobin).mode, "round-robin");
});

// TODO(fase-1, post-stabilisatie): voeg een `tests/feasibility-brute-force.fixture.ts`
// toe met brute-force gevalideerde verwachtingen voor (minstens) de zes
// ijkpunten hierboven. Dat geeft ground truth voor reachable/lowerBound los
// van mijn hand-afleidingen, en vangt regressies in `buildConfig` of
// `allowedLocationIdsForSlot` op die hand-afleidingen niet zien. Tot dan
// dekken bovenstaande tests de formule en de edge cases.
