# Fase 1 — Detailplan: Foundations + scoring

**Doel:** de drie kern-bouwstenen van het [unified ontwerp](generator-design.md) leggen — `analyzePlanFeasibility`, een nieuwe `computePlanScore`, en de `PlanStrategy` registry — en `generatePlan` migreren naar `generateBestPlan`. Geen nieuwe strategieën in deze fase: bestaande paden worden alleen herverpakt.

**Risico:** laag. Mechanisch werk plus één scherpere scoring-formule. De grootste valkuil is per ongeluk gedrag wijzigen tijdens het migreren van strategieën.

**Acceptatiecriterium:** alle tests slagen op de nieuwe scoring. Voor de vijf ijkpuntconfiguraties is het gedrag gelijk aan of beter dan vóór de refactor.

---

## Stap 1.1 — `analyzePlanFeasibility`

**Wat:** een pure functie die voor een gegeven `ConfigV2` de wiskundige ondergrenzen berekent zonder zoektocht.

**Waar:** nieuw bestand `packages/core/src/feasibility.ts`. De bestaande `packages/core/src/advisor/feasibility.ts` wordt later in fase 3 verwijderd; in fase 1 blijft hij naast bestaan zodat de advisor niet breekt.

**Type-signatuur:**

```typescript
export type ScheduleMode = "all-spellen" | "round-robin";

export interface SegmentFeasibility {
  segmentId: Id;
  groupCount: number;
  matchesPerGroup: number;
  reachableActivityTypes: number;
  lowerBoundSpelRepeats: number;
  lowerBoundMatchupCeiling: number;
  algebraicFeasible: boolean;
  byeAssistancePossible: boolean;
}

export interface FeasibilityReport {
  mode: ScheduleMode;
  segments: SegmentFeasibility[];
  totalLowerBoundSpelRepeats: number;
  messages: string[];
}

export function analyzePlanFeasibility(config: ConfigV2): FeasibilityReport;
```

**Berekening per segment:**

1. **`matchesPerGroup`** = `roundsNeeded` (uit `calculateSchedule`); bij oneven pool: `roundsNeeded - 1` voor de groepen die een keer rust krijgen, anders `roundsNeeded`. Voor v1 nemen we het maximum van de twee.
2. **`reachableActivityTypes`** = aantal unieke `activityTypeId` die de groepen van dit segment kunnen bereiken over **alle** rondes en blokken samen, gegeven `locationBlocks` en `relaxedBlockTimeslotIds`. Hergebruik de logica uit `advisor/feasibility.ts:99-145` (`uniqueActivityTypeCountForLocations` en de allowed-locations-iteratie).
3. **`lowerBoundSpelRepeats`** = `max(0, matchesPerGroup - reachableActivityTypes)` per groep, gesommeerd over het segment. Dit is identiek aan de bestaande `lowerBoundRepeatsTotal` berekening — die functie is wiskundig correct, alleen zit hij op de verkeerde plek.
4. **`lowerBoundMatchupCeiling`** = `ceil(roundsNeeded / (poolSize - 1))` (huidige `matchupMaxNeeded` in `config-builder.ts:95`).
5. **`algebraicFeasible`**:
   - `movementPolicy === "blocks"` én `locationBlocks` niet leeg
   - `groupCount` per segment is even
   - `H = groupCount / 2` met `H >= 3`, `H !== 6`
   - Er bestaat `k ∈ [2, H-1]` met `gcd(k, H) = 1` én `gcd(k-1, H) = 1`
   - `stationsPerLocationBlock >= H`
6. **`byeAssistancePossible`**:
   - `lowerBoundSpelRepeats > 0` (anders niet nodig)
   - Eén extra ronde met pauze-station zou de zoekruimte vergroten:
     - Of `pauseActivity` is al gedefinieerd, of er kan er een toegevoegd worden
     - `reachableActivityTypes >= matchesPerGroup` zou waar worden bij +1 ronde voor de groep die mag rusten
   - Voor de eerste implementatie: simpele heuristiek "extra ronde verlaagt het minimum als pool even is en pauseActivity beschikbaar". De diepere analyse is zorg voor fase 2.

**Modus-bewustzijn:** de functie krijgt de `mode` uit een nieuwe veld op `ConfigV2` (zie stap 1.2 hieronder). Voor v1 leiden we hem af van bestaande velden:
- `roundsNeeded > roundRobinRounds` → `all-spellen`
- anders → `round-robin`

In stap 1.5 wordt dit een expliciet veld in het model.

**Messages:** menselijk leesbare uitleg per segment dat `lowerBoundSpelRepeats > 0` heeft. Format zoals het bestaande `messages` array in `advisor/feasibility.ts`. Voorbeelden:

> *"Pool A: elke groep speelt 8 wedstrijden maar bereikt maar 4 unieke spellen. Minimaal 4 herhalingen per groep. Oplossing: voeg een extra ronde toe met pauze-activiteit, of verlaag de wedstrijden per groep naar 4."*

**Tests:** nieuw bestand `tests/feasibility.test.ts` met tabel-gedreven cases voor de zes ijkpunten:

| Config | groupsPerPool | spellen | layout | Verwacht `lowerBoundSpelRepeats` | Verwacht `algebraicFeasible` |
|---|---|---|---|---|---|
| 8g/4s | 4 | 4 | split | 0 (4 matches, 4 spellen) | false (H=4 geen geldige k) |
| 10g/5s | 5 | 5 | split | 0 | true (H=2.5, oneven groepen — false) → check |
| 12g/6s | 6 | 6 | split | 0 | true (H=3) |
| 16g/8s | 8 | 4 per loc | split | > 0 (8 matches, 4 reachable) | false (H=4) |
| 18g/10s | 9 | 5 per loc | split | > 0 (oneven pool) | false (oneven) |
| 20g/10s | 10 | 5 per loc | split | 0 | true (H=5) |

**Brute-force validatie:** voor elke ijkpuntconfig wordt apart een mini-script geschreven dat alle station-permutaties probeert (zoals de 16g/8s brute force uit de vorige sessie). De brute-force resultaten worden gehard-coded in een aparte `tests/feasibility-brute-force.fixture.ts` zodat de test snel blijft maar wel ground truth heeft.

---

## Stap 1.2 — Modus als eerste-klas veld op `ConfigV2`

**Wat:** voeg een expliciet `scheduleMode: "all-spellen" | "round-robin"` toe aan `ConfigV2.scheduleSettings`. Verplicht veld — geen fallback voor oude configs.

**Waarom in fase 1:** de scoring-gewichten in stap 1.3 hangen ervan af. We kunnen niet één modus aannemen.

**Dev-only:** het platform draait alleen in development. Bestaande opgeslagen configs zonder `scheduleMode` worden in dezelfde stap uit de DB gegooid (of er wordt een one-shot script gedraaid dat ze bijwerkt). Geen fallback in `assertConfigV2`, geen "leid maar af uit andere velden". Het veld is verplicht.

**Wijzigingen:**

1. **`packages/core/src/model.ts`:**
   ```typescript
   export interface ScheduleSettingsV2 {
     roundDurationMinutes: number;
     transitionMinutes: number;
     scheduleMode: "all-spellen" | "round-robin";
   }
   ```
   `assertConfigV2` (regel 294) checkt expliciet dat `scheduleSettings.scheduleMode` aanwezig is en gooit een heldere error als hij ontbreekt.

2. **`packages/core/src/config-builder.ts`:** `buildConfig` (regel 167) propageert `params.scheduleMode` naar `scheduleSettings.scheduleMode`. Het veld bestaat al als `params.scheduleMode`, het komt nu ook in de gebouwde config terecht.

3. **`components/config-wizard.tsx`:** geen wijziging in fase 1 — de wizard kiest `scheduleMode` al en geeft hem aan `buildConfig`. De UI-promotie naar "eerste-klas keuze altijd zichtbaar" is werk voor fase 3.

4. **DB-reset:** voor eigen ontwikkelconfigs in de Postgres-instance: gewoon de relevante rows verwijderen of een one-shot SQL script draaien dat `scheduleSettings.scheduleMode` invult. Niet als migratie verkleed — gewoon doen.

**Tests:** `tests/config-builder.test.ts` uitbreiden met:
- Een case die expliciet `scheduleMode: "round-robin"` zet → check dat het in de output staat
- Een case die `scheduleMode` weglaat → check dat `assertConfigV2` een heldere error gooit
- Een case met `scheduleMode: "all-spellen"` waar `spellenExceedRounds === false` → check dat de keuze gerespecteerd wordt

---

## Stap 1.3 — Nieuwe `computePlanScore`

**Wat:** vervang de huidige `computePlanScore` in `scoring.ts` door een implementatie die:
- modus-afhankelijke gewichten gebruikt
- `spelRepeatPenalty` normaliseert tegen `lowerBoundSpelRepeats` uit `analyzePlanFeasibility`
- `matchupCeilingPenalty` gebruikt in plaats van `matchupFairness`

**Geen feature-flag.** Direct vervangen.

**Type-signatuur:**

```typescript
export interface PlanScoreBreakdown {
  mode: ScheduleMode;
  stationOccupancy: number;       // 0..1
  spelVariety: number;           // 0..1
  spelRepeats: number;           // absoluut aantal herhalingen
  lowerBoundSpelRepeats: number; // wat wiskundig minimum is
  spelRepeatPenalty: number;     // 0..1, hoger = minder herhalingen boven minimum
  matchupMaxEncounters: number;
  lowerBoundMatchupCeiling: number;
  matchupCeilingPenalty: number;  // 0..1, hoger = minder paren boven plafond
  totalScore: number;             // gewogen som, hoger = beter
}

export function computePlanScore(
  plan: PlanV2,
  config: ConfigV2,
  feasibility?: FeasibilityReport,  // optioneel; wordt anders intern berekend
  byeStationIds?: Set<Id>
): PlanScoreBreakdown;
```

**Gewichten:**

```typescript
const WEIGHTS_ALL_SPELLEN = {
  spelRepeatPenalty: 5.0,
  spelVariety: 3.0,
  matchupCeilingPenalty: 1.5,
  stationOccupancy: 1.0,
};

const WEIGHTS_ROUND_ROBIN = {
  matchupCeilingPenalty: 5.0,
  spelRepeatPenalty: 3.0,
  spelVariety: 1.5,
  stationOccupancy: 1.0,
};
```

Maximum totaalscore in beide modi: `5.0 + 3.0 + 1.5 + 1.0 = 10.5`.

**Normalisatie van `spelRepeatPenalty`:**

```
actualRepeats = computeRepeatCount(plan, config)
excessRepeats = max(0, actualRepeats - feasibility.totalLowerBoundSpelRepeats)
maxUseful     = max(1, totalGroups * (matchesPerGroup - 1))
spelRepeatPenalty = 1 - excessRepeats / maxUseful
```

Dit betekent: als de generator het wiskundige minimum bereikt, scoort hij 1.0 — ook als dat minimum > 0 is. Eerlijk gewogen.

**Normalisatie van `matchupCeilingPenalty`:**

```
maxEncounters = computeMatchupMaxEncounters(plan, config)
ceiling       = feasibility.lowerBoundMatchupCeiling
excess        = sum(max(0, pairCount[p] - ceiling) for p in pairs)
maxUseful     = totalPairs * (matchesPerGroup - 1)
matchupCeilingPenalty = 1 - excess / max(1, maxUseful)
```

`stationOccupancy` en `spelVariety` blijven inhoudelijk gelijk aan de huidige implementatie — alleen de gewichten en de plek in de totaal-som veranderen.

**Tests:** `tests/scoring.test.ts` herschrijven:

1. **Modus-gewichten:** twee identieke plannen, één met `mode=all-spellen` en één met `mode=round-robin`, geven verschillende totaalscores. De gewichten zijn correct toegepast.
2. **Wiskundig minimum = perfecte score:** een plan dat het feasibility-minimum bereikt scoort `spelRepeatPenalty = 1.0`, ongeacht of dat minimum 0 of 4 is.
3. **Excess straffen:** elk extra herhaling boven het minimum verlaagt de score zichtbaar (niet verloren in normalisatie-ruis zoals nu).
4. **Matchup ceiling:** twee plannen met dezelfde absolute `maxEncounters` maar verschillend aantal paren-boven-plafond → het plan met meer overschrijdingen scoort lager.
5. **Backward compatibility check:** voor de bestaande v2-fixture (`tests/v2-fixtures.ts`) handmatig de verwachte nieuwe score uitrekenen en vastleggen als `expected`. Dit is de regression baseline.

**Migratie van bestaande tests:** alle tests die `score.totalScore` of `score.repeatPenalty` of `score.matchupFairness` checken moeten worden bijgewerkt:

- `tests/scoring.test.ts` — herschrijven (zie hierboven)
- `tests/optimize-preset-score.test.ts` — verwachte scores herberekenen
- `tests/advisor-impact-ordering.test.ts` — checken of de ordering nog klopt met nieuwe gewichten
- `tests/v2-basisschool-fixture.test.ts` — score-snapshot bijwerken

**Score-veranderingen documenteren:** elke aangepaste `expected`-waarde krijgt een commentaar dat verwijst naar de scoring-formule en uitlegt waarom de oude waarde fout was.

---

## Stap 1.4 — `PlanStrategy` interface en registry

**Wat:** verpakken van de bestaande generator-paden in een uniform interface, zodat fase 2 nieuwe strategieën kan toevoegen zonder de kern aan te raken.

**Waar:** nieuw bestand `packages/core/src/strategies/index.ts` plus per strategie een eigen bestand:
- `packages/core/src/strategies/algebraic.ts`
- `packages/core/src/strategies/round-robin-exact.ts`
- `packages/core/src/strategies/round-robin-slot.ts`

**Interface:**

```typescript
export interface PlanAttempt {
  plan: PlanV2;
  byesByTimeslot: Record<Id, Id[]>;
  strategyName: string;
}

export interface PlanStrategy {
  readonly name: string;
  applicable(config: ConfigV2, feasibility: FeasibilityReport): boolean;
  generate(
    config: ConfigV2,
    feasibility: FeasibilityReport,
    options?: GeneratePlanOptions
  ): PlanAttempt | null;
}

export const STRATEGY_REGISTRY: PlanStrategy[] = [
  algebraicStrategy,
  roundRobinExactStrategy,
  roundRobinSlotStrategy,
];
```

**Per strategie:**

1. **`algebraic.ts`** — verpakt `tryAlgebraicPlan` (huidig: `generator.ts:1761-1829`). De `applicable` check gebruikt de `feasibility.algebraicFeasible` vlag — dat is nu één plek.
2. **`round-robin-exact.ts`** — verpakt `assignToStationsByExactBlocks` (huidig: `generator.ts:1099-1285`). `applicable` = `movementPolicy === "blocks" && locationBlocks?.length`.
3. **`round-robin-slot.ts`** — verpakt `assignToStationsBySlot` (huidig: `generator.ts:982-1097`). `applicable` = altijd true; dit is de fallback.

De **interne** functies blijven bestaan in `generator.ts`. De strategieën zijn dunne wrappers die deze aanroepen. Geen logica-wijzigingen, geen afhankelijkheid op modus in de strategie zelf — modus zit in de scoring.

**Repair-pass:** `optimizePlanLocalIterative` (regel 1412) en `optimizeExistingPlanStations` (regel 2008) blijven waar ze zijn. Ze worden in fase 2 uitgebreid met cross-slot swaps; in fase 1 blijven ze ongemoeid. De repair wordt vanuit `generateBestPlan` aangeroepen, niet vanuit elke strategie individueel.

**Tests:** `tests/strategies.test.ts` (nieuw) met per strategie:
- `applicable` returnt true voor een geschikte config en false voor een ongeschikte
- `generate` returnt een geldig `PlanAttempt` voor een geschikte config
- `generate` returnt `null` wanneer `applicable` false zegt (defensieve check)

---

## Stap 1.5 — `generateBestPlan` als nieuwe entry point

**Wat:** vervang `generatePlan` (regel 1831) door `generateBestPlan` die de registry aanroept.

**Type-signatuur:**

```typescript
export interface GenerateBestPlanResult {
  plan: PlanV2;
  byesByTimeslot: Record<Id, Id[]>;
  feasibility: FeasibilityReport;
  achievedScore: PlanScoreBreakdown;
  strategyUsed: string;
  attempts: Array<{
    strategyName: string;
    score: PlanScoreBreakdown | null;
    failed?: string;
  }>;
}

export function generateBestPlan(
  config: ConfigV2,
  options?: GeneratePlanOptions
): GenerateBestPlanResult;
```

**Werking:**

1. Bereken `feasibility = analyzePlanFeasibility(config)`
2. Voor elke strategie waar `applicable === true`:
   - Probeer `generate(config, feasibility, options)`
   - Vang `NoSolutionError` af en log in `attempts`
   - Bij succes: draai de repair-pass (zelfde als nu)
   - Bereken `score = computePlanScore(plan, config, feasibility)`
3. Kies de poging met de hoogste `totalScore` als `best`
4. Return `best.plan`, `best.score`, `feasibility`, en het volledige `attempts`-array voor transparantie

**Tijdelijke alias `generatePlan`:** om in fase 1 niet alle aanroepers tegelijk te hoeven omzetten, blijft `generatePlan` bestaan als alias die `generateBestPlan` aanroept en alleen `{ plan, byesByTimeslot, optimization, stationOptimization }` teruggeeft. Aanroepers (`app/planner/page.tsx`, `components/config-wizard.tsx`, tests) blijven daardoor werken zonder wijziging in fase 1.

**Deadline op de alias:** de alias **moet** weg in fase 3 stap 3.3 (planner refactor) en stap 3.2 (wizard refactor). Het verwijderen ervan is een expliciete stap in fase 3 met eigen acceptatie-criterium. Dit wordt ook als `// TODO(fase-3): remove this alias` comment in de code gemarkeerd, met expliciete verwijzing naar het stapnummer in `docs/generator-fase-3-plan.md`. Zonder die afspraak wordt de alias permanent en is de refactor mislukt.

**Tests:** `tests/generate-best-plan.test.ts` (nieuw):

1. **Strategie-selectie:** voor 12g/6s wint `algebraic`. Voor 16g/8s wint `round-robin-exact` (in fase 1, voordat `bye-assisted` bestaat).
2. **Eerlijk rapport:** `attempts` bevat alle geprobeerde strategieën met hun score (of failure-reden).
3. **Ijkpunt-validatie:** voor elk van de vijf ijkpunten haalt `generateBestPlan` minimaal het wiskundige minimum dat `analyzePlanFeasibility` voorspelt. Dit is geen "gelijk aan voorheen" — dit is "klopt met de wiskunde".

---

## Stap 1.6 — Bestaande tests opschonen

Met de scoring-wijziging in stap 1.3 zullen sommige tests falen die expliciete oude score-getallen verwachten. Per test maken we één van drie keuzes:

1. **Vervangen** — de test meet iets zinvols, maar met de oude formule. Schrijf hem om zodat hij meet wat we *nu* willen meten met de nieuwe formule.
2. **Verwijderen** — de test bevroor toevallig oud gedrag dat we expliciet hebben veranderd. Geen historische waarde, weg ermee.
3. **Behouden** — de test meet structureel gedrag (niet een score-getal) dat onveranderd blijft. Laat staan.

**Geen "bewust herberekenen van oude expected-waarden".** Als een test alleen bestaat om een score-snapshot te bevriezen, hoort hij vervangen of verwijderd te worden — niet bijgewerkt.

**Verwachte impactgebieden:**
- `tests/scoring.test.ts` — herschreven in stap 1.3
- `tests/optimize-preset-score.test.ts` — vermoedelijk verwijderen; "preset score" is precies het soort bevriezing dat geen waarde meer heeft
- `tests/v2-basisschool-fixture.test.ts` — score-snapshot vervangen door inhoudelijke checks (klopt het aantal allocaties, zijn alle groepen geplaatst, is er geen herhaling boven het minimum)
- `tests/wizard-feasibility.test.ts` — vervangen, want de wizard krijgt straks data uit `analyzePlanFeasibility` in plaats van uit eigen brute-force trials
- `tests/advisor-impact-ordering.test.ts` — vermoedelijk verwijderen; impact-ordering verdwijnt met de oude advisor in fase 3

**Niet aanraken in fase 1:**
- Tests in `tests/advisor-*.test.ts` die over `findProvenSolutions` gaan — die blijven werken op het oude pad. Verwijdering volgt in fase 3.

---

## Stap 1.7 — Re-exports en index

**Wat:** zorg dat de nieuwe symbolen via `@core` beschikbaar zijn.

**Wijzigingen in `packages/core/src/index.ts`:**

```typescript
export * from "./feasibility";          // nieuw
export * from "./strategies";           // nieuw
// bestaande exports blijven
```

**Validatie:** `npm run build` slaagt en `tsc --noEmit` geeft geen fouten in `app/`, `components/` of `tests/`.

---

## Volgorde van werken in fase 1

Kan grotendeels parallel, maar deze volgorde minimaliseert merge-conflicten:

1. Stap 1.2 — modus-veld toevoegen (klein, geïsoleerd)
2. Stap 1.1 — `analyzePlanFeasibility` schrijven met tests
3. Stap 1.3 — nieuwe `computePlanScore` (afhankelijk van 1.1 en 1.2)
4. Stap 1.6 — bestaande tests bijwerken (afhankelijk van 1.3)
5. Stap 1.4 — `PlanStrategy` registry (parallel met 1.3 mogelijk)
6. Stap 1.5 — `generateBestPlan` (afhankelijk van 1.4)
7. Stap 1.7 — re-exports + build check

---

## Acceptatie-checklist fase 1

- [ ] `analyzePlanFeasibility` bestaat in `packages/core/src/feasibility.ts`
- [ ] `tests/feasibility.test.ts` slaagt voor de zes ijkpunten met brute-force-gevalideerde verwachtingen
- [ ] `ConfigV2.scheduleSettings.scheduleMode` bestaat als verplicht veld en wordt door `buildConfig` ingevuld
- [ ] `assertConfigV2` gooit een heldere error als `scheduleMode` ontbreekt — geen fallback
- [ ] Eigen ontwikkeldata is bijgewerkt of gereset zodat alle opgeslagen configs het nieuwe veld hebben
- [ ] `computePlanScore` gebruikt modus-afhankelijke gewichten en `matchupCeilingPenalty`
- [ ] Bestaande score-tests zijn vervangen of verwijderd — geen "bewust herberekende" oude waarden
- [ ] `PlanStrategy` interface bestaat en de drie bestaande paden zijn als strategie verpakt
- [ ] `generateBestPlan` is de nieuwe entry point
- [ ] `generatePlan` bestaat als tijdelijke alias met `// TODO(fase-3)` markering
- [ ] `npm test` slaagt
- [ ] `npm run build` slaagt
- [ ] Voor alle vijf ijkpuntconfiguraties: `generateBestPlan` haalt minstens het wiskundige minimum dat `analyzePlanFeasibility` voorspelt
