# Fase 2 — Detailplan: Nieuwe strategieën + bye-beslismoment

**Doel:** de zoekruimte van de generator daadwerkelijk uitbreiden zodat het wiskundige minimum bereikbaar wordt voor de "lelijke" H-waarden (4, 6, 8, 10), inclusief het expliciete beslismoment over bye-assistance.

**Vereisten:** fase 1 is afgerond. `analyzePlanFeasibility`, nieuwe `computePlanScore`, `PlanStrategy` registry en `generateBestPlan` bestaan.

**Risico:** middel. Zoekruimte-uitbreiding kan trager zijn dan acceptabel; daarom een feature-flag prototype voor bye-assistance.

**Acceptatiecriterium:** 16g/8s/split haalt het wiskundige minimum (4 herhalingen per blok = max 8 totaal) — via Pad A direct, of via Pad B na toepassing van een door `proposeAlternatives` gesuggereerde wijziging. Regression test op alle vijf ijkpuntconfiguraties.

---

## Stap 2.1 — `shuffled-rounds` strategie

**Wat:** een strategie die de circle-method ronde-volgorde gericht permuteert om spel-herhalingen te verminderen, in plaats van de huidige brute-force seed-search met 20+ random seeds.

**Waar:** nieuw bestand `packages/core/src/strategies/shuffled-rounds.ts`.

**Probleem dat we oplossen:** de huidige `assignToStationsByExactBlocks` werkt op één vaste rondevolgorde uit `generateRoundRobin`. Sub-blokken worden sequentieel-greedy gevuld, wat betekent dat sub-blok 2 vastzit aan de keuzes van sub-blok 1. Door de rondes binnen een blok anders te ordenen kunnen herhalingen anders verdeeld worden — soms beter, soms slechter.

**Algoritme:**

```
input: config, feasibility
1. Genereer ronde-volgorde met generateRoundRobin (zoals nu)
2. Verdeel rondes in blokken op basis van locationBlocks
3. Per blok, voor elke permutatie van sub-blok-grenzen (binnen het blok):
   a. Probeer assignToStationsByExactBlocks met die volgorde
   b. Bereken score = computePlanScore op het resultaat
   c. Houd de beste bij
4. Return de beste over alle permutaties
```

**Gerichte permutatie, niet brute force:** in plaats van 20+ random seeds proberen we **geinformeerde permutaties**:

1. **Identificeer probleem-rondes:** rondes waarin de huidige toewijzing herhalingen veroorzaakt (groep krijgt spel die hij eerder al deed)
2. **Probeer die rondes naar voren te schuiven:** als een herhaling ontstaat in ronde 5, probeer die ronde-matches in ronde 1 of 2 te leggen waar de groep nog "vers" is
3. **Beperking:** alleen rondes binnen hetzelfde blok mogen onderling van plaats wisselen (anders breken `locationBlocks` constraints)

**Tijdsbudget:** geen harde tijdslimiet (per memory-feedback `feedback_no_artificial_limits.md`), maar wel een **zoek-cutoff**: stop zodra er een permutatie is gevonden die het `lowerBoundSpelRepeats` uit `feasibility` bereikt. Verder zoeken heeft geen zin, want het minimum is gehaald.

**Type-signatuur:** standaard `PlanStrategy` interface uit fase 1.

**`applicable`:** `movementPolicy === "blocks"` en `locationBlocks?.length >= 1` en `feasibility.totalLowerBoundSpelRepeats > 0` (alleen actief als er iets te winnen valt — bij 0 minimum is de standard strategie al optimaal).

**Tests:** `tests/strategies-shuffled-rounds.test.ts`:

1. **Triviale case:** voor 12g/6s (algebraic feasible) is `shuffled-rounds` weliswaar `applicable=false`, maar als hij toch wordt aangeroepen produceert hij een geldig plan.
2. **Lelijke case:** voor 16g/10s/split bereikt `shuffled-rounds` strikt minder herhalingen dan `round-robin-exact` zonder shuffles. Concreet getal komt uit een brute-force fixture.
3. **Geen verslechtering:** voor elke ijkpuntconfig is de score van `shuffled-rounds` ≥ die van `round-robin-exact` (anders heeft de strategie geen toegevoegde waarde).
4. **Convergentie:** als het minimum bereikbaar is binnen de zoekruimte van de strategie, vindt hij het — controleer dit voor 18g/10s.

---

## Stap 2.2 — `crossSlotRepair` als aparte pass

**Wat:** een nieuwe functie `crossSlotRepair` die ná de bestaande `optimizePlanLocalIterative` draait en allocaties **tussen** rondes ruilt waar dat de score verbetert. Bewust apart van de bestaande optimizer (die is al 200+ regels) zodat hij zelfstandig getest, aan/uitgezet en later vervangen kan worden.

**Waar:** nieuw bestand `packages/core/src/repair/cross-slot.ts`. De bestaande `optimizePlanLocalIterative` in `generator.ts:1412-1620` blijft ongewijzigd.

**Probleem dat we oplossen:** de huidige optimizer kan alleen moves en swaps **binnen** hetzelfde timeslot. Als groep A op station X in ronde 3 een herhaling veroorzaakt en groep B op station Y in ronde 5 dezelfde herhaling-relatie heeft, dan kan hij ze niet ruilen — die ruil zit in een blinde vlek.

**Type-signatuur:**

```typescript
export interface CrossSlotRepairOptions {
  feasibility: FeasibilityReport;
  maxIterations?: number;
}

export interface CrossSlotRepairResult {
  plan: PlanV2;
  appliedSwaps: Array<{
    timeslotIdA: Id;
    timeslotIdB: Id;
    stationIdA: Id;
    stationIdB: Id;
    scoreBefore: number;
    scoreAfter: number;
  }>;
  iterations: number;
}

export function crossSlotRepair(
  config: ConfigV2,
  plan: PlanV2,
  options: CrossSlotRepairOptions
): CrossSlotRepairResult;
```

**Wat een cross-slot swap is:**

Een ruil van het `stationId` tussen twee allocaties uit verschillende timeslots, mits:
1. Beide allocaties horen bij hetzelfde segment
2. Beide stations bevinden zich in een locatie die toegestaan is voor het segment in de doel-timeslot (blok-policy)
3. De capaciteit van beide stations past bij de groepen
4. De swap verlaagt de totale `computePlanScore` (met de feasibility-genormaliseerde formule uit fase 1 stap 1.3)

**Algoritme:**

```
herhaal tot maxIterations of geen verbetering:
  bestSwap = null
  bestDelta = 0
  
  voor elk paar (allocA, allocB) waar allocA.timeslotId !== allocB.timeslotId:
    als allocA.segmentId !== allocB.segmentId: skip
    als allocA.stationId === allocB.stationId: skip
    
    candidatePlan = swap stationIds tussen allocA en allocB
    
    als !valid(candidatePlan): skip
    als hasBlockPolicyViolation(candidatePlan): skip
    
    delta = score(candidatePlan) - score(workingPlan)
    als delta > bestDelta:
      bestDelta = delta
      bestSwap = (allocA, allocB)
  
  als bestSwap === null: stop
  pas bestSwap toe
  log in appliedSwaps
```

**Hill-climbing**, niet exhaustief. Per iteratie zoekt hij de beste swap en past die toe. Stopt zodra geen verbetering meer mogelijk is.

**Performance:** `O(n²)` per iteratie over allocaties. Voor 16g/8r is dat 64² = 4096 paren per iteratie, in praktijk een paar iteraties. Een paar honderd milliseconden — acceptabel naast de rest van `generateBestPlan`.

**Aanroep vanuit `generateBestPlan`:** ná `optimizePlanLocalIterative`, vóór de finale validatie. De bestaande tweede pass `optimizeExistingPlanStations` blijft erna draaien.

**Tests:** nieuw bestand `tests/cross-slot-repair.test.ts`:

1. **Cross-slot vindt verbetering:** een handgemaakt plan waarin een herhaling alleen via een cross-slot swap kan worden weggenomen. Verifieer dat `crossSlotRepair` dat vindt en de juiste swap meldt.
2. **Geen schending van blok-policy:** test dat een swap die de blok-policy zou schenden, geweigerd wordt.
3. **Geen schending van capaciteit:** test dat een swap waarbij de capaciteit niet past, geweigerd wordt.
4. **Idempotent op een al-optimaal plan:** als het plan geen verbetering toelaat, returnt `crossSlotRepair` exact het input-plan met `appliedSwaps: []`.
5. **Aanroepbaarheid los van `generateBestPlan`:** de functie werkt op elk geldig `PlanV2` zonder afhankelijkheid van de generator-context.

---

## Stap 2.3 — Bye-assistance prototype + meting

**Wat:** prototype een `bye-assisted` strategie en meet of hij het wiskundige minimum bereikt voor 16g/8s en 16g/10s binnen acceptabele tijd. Het resultaat van deze meting bepaalt of we Pad A (strategie) of Pad B (voorstel) volgen.

**Waar:** nieuw bestand `packages/core/src/strategies/bye-assisted.ts`. We zetten hem direct in `STRATEGY_REGISTRY` — geen feature-flag. Als de meting laat zien dat hij niet werkt of regressies geeft, halen we hem aan het eind van fase 2 weer uit de registry. Dev-only: dit is gewoon proberen-meten-beslissen, geen voorzichtige uitrol.

**Idee:** voor configuraties waar `feasibility.byeAssistancePossible === true` voegt de strategie virtueel één extra ronde toe waarin elke groep precies één keer op een pauze-station belandt. Die "rust"-ronde kan dan worden gebruikt om een spel-herhaling te voorkomen door de groep daar te plaatsen in plaats van op het station dat de herhaling zou veroorzaken.

**Algoritme (high-level):**

```
input: config, feasibility
1. Vereisten check:
   - feasibility.byeAssistancePossible === true
   - config.pauseActivity bestaat OF kan worden toegevoegd
2. Bouw een tijdelijke variant van de config met +1 actieve ronde en pauseActivity
3. Roep round-robin-exact aan op de variant
4. Map het resultaat terug naar de oorspronkelijke timeslot-volgorde
5. Return als PlanAttempt — let op: het plan bevat één extra ronde,
   wat betekent dat de gebruiker akkoord moet gaan met een langer programma
```

**Belangrijk:** als de strategie wint, is het resulterende plan **structureel anders** (één extra ronde). Dit moet eerlijk worden gerapporteerd in de UI ("we hebben een extra ronde toegevoegd om 0 herhalingen te bereiken"). Voor het beslismoment onder is dit een argument vóór Pad B (voorstel via `proposeAlternatives`), omdat de gebruiker bewust akkoord moet gaan met de extra ronde.

**Meting (het beslismoment):**

Schrijf een mini-benchmark `tests/benchmark-bye-assisted.ts` (geen unit test, een runnable script) dat:

1. Voor 16g/8s/split en 16g/10s/split: roep `generateBestPlan` aan met de prototype `bye-assisted` strategie in de registry.
2. Roep dan een tweede variant aan waarin de bye-assisted strategie tijdelijk uit de registry is gehaald, maar de config wel handmatig is uitgebreid met "+1 ronde + pauseActivity" — dit simuleert wat Pad B in fase 3 zou doen.
3. Meet voor beide:
   - `achievedScore.totalScore`
   - `achievedScore.spelRepeats`
   - Wall-clock tijd tot resultaat
4. Voor 12g/6s en 20g/10s: controleer dat de prototype `bye-assisted` strategie niet onverwacht wint (regressie-check — een al perfecte config mag niet worden veranderd).

**Beslissingsregels:**

| Situatie | Keuze |
|---|---|
| Prototype bereikt minimum, blijft binnen redelijke tijd, geen regressies op 12g/6s en 20g/10s | Pad A |
| Prototype bereikt minimum niet, of geeft regressies, of duurt onaanvaardbaar lang | Pad B |
| Pad B (handmatige config-uitbreiding) bereikt het minimum sneller dan Pad A | Pad B |

"Redelijke tijd" en "onaanvaardbaar lang" worden niet vooraf in seconden vastgepind — per memory `feedback_no_artificial_limits.md` werken we niet met kunstmatige limieten. We meten en besluiten op basis van de werkelijke getallen.

**Notitie:** de uitkomst + meetresultaten worden vastgelegd in `docs/generator-fase-2-bye-beslissing.md` voordat fase 2 wordt afgesloten. De notitie bevat de gemeten getallen, de gekozen pad, en de motivatie.

**Tests:** alleen relevant als Pad A wordt gekozen. Dan komt er `tests/strategies-bye-assisted.test.ts` met:
1. `applicable` correct voor de "lelijke" H-waarden
2. `applicable` is false voor 12g/6s, 20g/10s
3. Voor 16g/8s bereikt de strategie 0 herhalingen (mits het wiskundige minimum dat is na toevoeging van een ronde)
4. De toegevoegde ronde wordt eerlijk gerapporteerd in `byesByTimeslot`

---

## Stap 2.4 — Cleanup volgens gekozen pad

**Bij Pad A gekozen:**
- `bye-assisted.ts` blijft in `STRATEGY_REGISTRY`
- De extra ronde + pauseActivity wordt structureel toegevoegd door de strategie zelf in een tijdelijke config-kopie; de oorspronkelijke `ConfigV2` blijft ongewijzigd
- UI moet (in fase 3) de "extra ronde" eerlijk tonen aan de gebruiker

**Bij Pad B gekozen:**
- `bye-assisted.ts` wordt verwijderd
- De strategie wordt uit `STRATEGY_REGISTRY` gehaald
- Het idee leeft voort als een gerichte regel in `proposeAlternatives` (fase 3 stap 3.6): "voor jouw config (16g/8s) is het wiskundige minimum 4 herhalingen, maar als je één extra ronde toevoegt met pauze-activiteit dan wordt het 0. Klik om toe te passen."
- De gebruiker kiest bewust om de config aan te passen; de generator hoeft geen virtuele rondes te beheren

In beide gevallen wordt het beslismoment vastgelegd in de notitie uit stap 2.3.

---

## Stap 2.5 — Regression op de vijf ijkpunten

**Wat:** controleer dat fase 2 voor elk van de vijf ijkpuntconfiguraties het verwachte resultaat oplevert.

**Verwachting (de "scoreboard" voor fase 2):**

| Config | Vóór fase 2 | Doel na fase 2 |
|---|---|---|
| 12g/6s/split | 0 (algebraic) | 0 (geen verandering) |
| 16g/8s/split | 16 | ≤ 8 (via shuffled-rounds + cross-slot swap), of 0 via bye-assisted indien Pad A |
| 16g/10s/split | 14 | ≤ 8, of 0 via bye-assisted |
| 18g/10s/split | 6 | ≤ 6 (oneven pool, blijft moeilijk) |
| 20g/10s/split | 0 (algebraic) | 0 |

**Test:** `tests/ijkpunten.test.ts` (nieuw) draait alle vijf en checkt dat het resultaat ≤ het doel is. Slaagt → fase 2 is klaar.

---

## Volgorde van werken in fase 2

1. Stap 2.1 — `shuffled-rounds` strategie + tests (los van alles, kan eerst)
2. Stap 2.2 — cross-slot swaps in repair (parallel met 2.1 mogelijk)
3. Stap 2.3 — bye-assisted prototype achter feature-flag
4. Stap 2.3 — meting + beslismoment + notitie
5. Stap 2.4 — cleanup volgens gekozen pad
6. Stap 2.5 — regression op ijkpunten

---

## Acceptatie-checklist fase 2

- [ ] `shuffled-rounds` strategie bestaat en is `applicable` voor blocks-mode
- [ ] `tests/strategies-shuffled-rounds.test.ts` slaagt
- [ ] `crossSlotRepair` bestaat als aparte functie in `packages/core/src/repair/cross-slot.ts`
- [ ] `crossSlotRepair` wordt vanuit `generateBestPlan` aangeroepen na `optimizePlanLocalIterative`
- [ ] `tests/cross-slot-repair.test.ts` slaagt
- [ ] Bye-assistance prototype is gemeten op 16g/8s en 16g/10s
- [ ] `docs/generator-fase-2-bye-beslissing.md` bestaat met meetresultaten en gekozen pad
- [ ] Cleanup volgens gekozen pad is uitgevoerd (strategie blijft of is verwijderd)
- [ ] `tests/ijkpunten.test.ts` slaagt voor alle vijf configs
- [ ] `npm test` slaagt
- [ ] `npm run build` slaagt
