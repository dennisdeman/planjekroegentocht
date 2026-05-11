# Fase 3 — Detailplan: Unified advies + LLM-uitbreiding

**Doel:** wizard en planner laten samenkomen in één bron van waarheid voor alternatieven, en de bestaande LLM-functionaliteit verplaatsen van een parallel pad naar een optionele uitbreiding bovenop `proposeAlternatives`.

**Vereisten:** fase 1 en 2 zijn afgerond. `analyzePlanFeasibility`, `generateBestPlan`, de strategie-registry en (afhankelijk van het beslismoment uit fase 2) `bye-assisted` strategie of de bye-toevoeging als advies-regel bestaan.

**Risico:** middel. Het samenvoegen van wizard- en planner-paden kan UI-state-bugs creëren; de LLM-rolverandering vraagt nieuwe prompts.

**Acceptatiecriterium:** wizard en planner geven voor dezelfde config dezelfde voorstellen met dezelfde getallen. De LLM-uitbreiding werkt achter zijn feature-flag en levert in test-runs combinaties op die de deterministische zoektocht niet had gevonden — én die na verificatie inderdaad beter scoren.

---

## Stap 3.1 — `proposeAlternatives` implementeren

**Wat:** de centrale functie die voor een gegeven config een lijst alternatieven genereert die elk **echt** worden uitgevoerd via `generateBestPlan` om te zien wat ze opleveren.

**Waar:** nieuw bestand `packages/core/src/alternatives.ts`. Dit is bewust *niet* in `advisor/` — de advisor wordt opgeknipt en de naam "advisor" verdwijnt deels.

**Type-signatuur:**

```typescript
export interface AlternativePatch {
  // Subset van wat de wizard kan toepassen + wat de planner kan rebuilden
  groupCount?: number;
  groupsPerPool?: number[];
  spellen?: string[];
  stationLayout?: "same" | "split";
  scheduleMode?: "all-spellen" | "round-robin";
  movementPolicy?: "free" | "blocks";
  addTimeslots?: number;          // aantal extra actieve rondes
  addPauseActivity?: string;      // naam van pauze-activiteit
  locations?: string[];
}

export interface Alternative {
  id: string;
  label: string;          // korte UI-tekst, bv. "14 groepen + 1 extra spel"
  reason: string;         // waarom deze suggestie wiskundig zinvol is
  apply: AlternativePatch;
  mathMinimum: number;    // lowerBoundSpelRepeats van de aangepaste config
  achievedScore: PlanScoreBreakdown;
  achievedRepeats: number;
  costToUser: number;     // 1-10, hoe ingrijpend de wijziging is
  source: "deterministic" | "llm";
}

export function proposeAlternatives(
  config: ConfigV2,
  currentPlan?: PlanV2,
  options?: {
    maxAlternatives?: number;       // default 5
    costBudget?: number;            // default 7
    seedAlternatives?: AlternativePatch[];  // voor LLM-uitbreiding
  }
): Promise<Alternative[]>;
```

**Algoritme:**

```
1. baseFeasibility = analyzePlanFeasibility(config)
2. baseScore = currentPlan ? computePlanScore(currentPlan, config, baseFeasibility)
                           : generateBestPlan(config).achievedScore
3. candidates = enumerateCandidates(config, baseFeasibility, options.costBudget)
4. for each candidate:
     a. patchedConfig = applyPatch(config, candidate.apply)
     b. patchedFeasibility = analyzePlanFeasibility(patchedConfig)
     c. result = generateBestPlan(patchedConfig)
     d. accept = result.achievedScore.totalScore > baseScore.totalScore
                 || result.achievedScore.spelRepeats < baseScore.spelRepeats
     e. if accept: alternatives.push({ ...candidate, mathMinimum, achievedScore })
5. sort alternatives by:
     - first: mathMinimum === 0 ? 0 : 1
     - then: mathMinimum ascending
     - then: achievedScore.totalScore descending
     - then: costToUser ascending
6. return alternatives.slice(0, maxAlternatives)
```

**`enumerateCandidates`:** dit is de hart van de functie. Hij genereert kandidaten **gericht**, niet brute-force.

```
gerichte dimensies:
  1. Group count → richting "nice H" waarden:
     - voor algebraic-feasibility: 6, 10, 14, 18, 22 per pool
     - distance van currentGroupCount tot maximaal 6 weg
  2. Spel count → richting reachableActivityTypes >= matchesPerGroup:
     - voor configs met lowerBoundSpelRepeats > 0: voeg spellen toe tot het minimum 0 wordt
     - andere richting (verwijderen) alleen als spelVariety > matchesPerGroup
  3. Pool herverdeling (alleen als usePools en huidige verdeling oneven):
     - voor 2 pools: probeer 8+8 in plaats van 9+7, etc.
  4. Layout flip: same ↔ split (één variant)
  5. Movement flip: free ↔ blocks (één variant, alleen als usePools en locations >= 2)
  6. Extra rondes met pauseActivity:
     - +1 ronde, +2 rondes (alleen als feasibility.byeAssistancePossible)
  7. Pauze-activiteit toevoegen zonder andere wijzigingen (alleen als hasBye)

combinaties:
  - alleen 1- en 2-dimensionale combinaties
  - cost = som van per-dimensie-kosten
  - filter: cost <= options.costBudget
```

**Per-dimensie kosten** (zelfde als huidige `findNearestPerfect`):

```
COST_SPEL = 1
COST_GROUP = 2
COST_LAYOUT = 3
COST_LOCATION = 3
COST_SCHEDULE = 1
COST_MOVEMENT = 4
COST_TIMESLOT = 1
COST_PAUSE = 1
```

**`applyPatch`:** een pure functie die een `AlternativePatch` op een `ConfigV2` toepast en een nieuwe config teruggeeft. Hergebruikt de bestaande `buildConfig` infrastructuur (`packages/core/src/config-builder.ts`) voor de heavy lifting.

**Tests:** `tests/alternatives.test.ts`:

1. **Lege lijst voor perfecte config:** als de huidige config al `mathMinimum === 0` en `totalScore` hoog heeft, dan returnt de functie een lege lijst (er zijn geen verbeteringen).
2. **Vindt nice-H suggestie:** voor 16g/8s (lelijke H=4) bevat de output een suggestie naar 14g of 18g per pool met `mathMinimum === 0`.
3. **Pauze-activiteit suggestie:** voor 18g/10s (oneven pool) bevat de output "voeg pauze-activiteit toe" met een verbeterde `achievedScore`.
4. **Sortering klopt:** alternatieven met `mathMinimum === 0` staan bovenaan; binnen die groep wint hoogste score.
5. **Cost budget filter:** met `costBudget: 3` worden combinaties met cost > 3 niet meegenomen.

---

## Stap 3.2 — Wizard refactor: `findNearestPerfect` vervangen

**Wat:** verwijder de eigen optimalisatielogica uit `components/config-wizard.tsx` en vervang door aanroepen naar `proposeAlternatives` en `analyzePlanFeasibility`.

**Wijzigingen in `components/config-wizard.tsx`:**

1. **Verwijder** `findNearestPerfect` (regel 95-218) en `buildAlternativeLabel` (regel 220-268).
2. **Verwijder** de `optimization` state (regel 359). Vervang door:
   ```typescript
   const [alternatives, setAlternatives] = useState<Alternative[]>([]);
   const [alternativesLoading, setAlternativesLoading] = useState(false);
   ```
3. **Vervang** `runOptimization` (regel 404-416) door:
   ```typescript
   async function runOptimization() {
     setAlternativesLoading(true);
     const config = wizardBuildConfig();
     const result = await proposeAlternatives(config, undefined, { maxAlternatives: 5 });
     setAlternatives(result);
     setAlternativesLoading(false);
   }
   ```
4. **Verwijder** `feasibility` state — vervang door directe aanroep van `analyzePlanFeasibility` plus `generateBestPlan` voor de huidige config:
   ```typescript
   const [analysis, setAnalysis] = useState<{
     feasibility: FeasibilityReport;
     bestPlan: GenerateBestPlanResult;
   } | null>(null);
   
   useEffect(() => {
     // Real-time bij wijziging van relevante velden
     const config = wizardBuildConfig();
     const feasibility = analyzePlanFeasibility(config);
     const bestPlan = generateBestPlan(config);
     setAnalysis({ feasibility, bestPlan });
   }, [/* dependencies */]);
   ```
5. **Update stap 7 UI:** de "Optimaliseer mijn kroegentocht" knop blijft, maar toont nu de output van `proposeAlternatives`. De `alt.repeats` wordt vervangen door `alt.achievedRepeats`, `alt.label` blijft gelijk, en er komt een `alt.reason` regel bij.
6. **Vervang alle aanroepen van `generatePlan`** in dit bestand door `generateBestPlan`. Dit is onderdeel van het verwijderen van de fase-1 alias.

**Modus als eerste-klas keuze:** in stap 5 van de wizard wordt `scheduleMode` nu **altijd** zichtbaar, niet alleen als `spellenExceedRounds`. Dit is een UI-wijziging die past bij het ontwerp uit §1.3 van het hoofddocument.

**Tests:** `tests/wizard-feasibility.test.ts` bijwerken — de oude `findNearestPerfect` testen worden vervangen door tests die controleren dat de wizard de juiste data uit `proposeAlternatives` toont.

---

## Stap 3.3 — Planner refactor: `findProvenSolutions` vervangen

**Wat:** verwijder `findProvenSolutions` en `generateDeterministicCandidates` uit het deterministische pad in de planner. Vervang door `proposeAlternatives`. De LLM-functionaliteit wordt hergebruikt in stap 3.4.

**Wijzigingen in `app/planner/page.tsx`:**

1. **Vervang** `runAdvisor` (regel 337-407) door:
   ```typescript
   const runAnalysis = useCallback(async () => {
     if (!activePlan) return;
     setAnalysisBusy(true);
     try {
       const alternatives = await proposeAlternatives(activeConfig, activePlan);
       
       // Optioneel: LLM-uitbreiding (zie stap 3.4)
       if (advisorAiProvider !== "none") {
         const llmAlts = await runLlmExtension(activeConfig, alternatives);
         setAlternatives([...alternatives, ...llmAlts]);
       } else {
         setAlternatives(alternatives);
       }
     } finally {
       setAnalysisBusy(false);
     }
   }, [activeConfig, activePlan]);
   ```
2. **Verwijder** alle `AdvisorResult`, `ProvenSolution`, en gerelateerde types — die hoeven niet meer.
3. **Vervang** de `applyProvenSolution` functie door een `applyAlternative` die werkt op het nieuwe `Alternative` type.
4. **Verwijder** de aparte "Analyseer met Claude" knop — die wordt samengevoegd met de standaard "Analyseer" knop in stap 3.4.
5. **Vervang alle aanroepen van `generatePlan`** in dit bestand door `generateBestPlan`. Dit is onderdeel van het verwijderen van de fase-1 alias.

**Verwijderen van bestanden:**
- `packages/core/src/advisor/advisor.ts` — wordt vervangen door `alternatives.ts` plus de LLM-uitbreiding (stap 3.4)
- `packages/core/src/advisor/candidates.ts` — wordt vervangen door `enumerateCandidates` in `alternatives.ts`
- `packages/core/src/advisor/scoring.ts` — functies worden ofwel hergebruikt vanuit `scoring.ts` ofwel verwijderd
- `packages/core/src/advisor/feasibility.ts` — vervangen door de nieuwe `feasibility.ts` uit fase 1
- `packages/core/src/advisor/verify.ts` — wordt deel van `alternatives.ts` als hulpfunctie voor de LLM-uitbreiding
- `app/api/advisor/analyze/route.ts` — verwijderd
- De `applyAdvisorPatch` export uit `commands.ts` — vervangen door een nieuwe `applyAlternativePatch` die op het nieuwe `AlternativePatch` formaat werkt

**Wat blijft bestaan:**
- `packages/core/src/advisor/providers/` — de LLM-providers (claude.ts, openai.ts, grok.ts, llm.ts) worden hergebruikt door de LLM-uitbreiding in stap 3.4. Eventueel verplaatsen naar `packages/core/src/llm/` om de naam "advisor" helemaal weg te krijgen.
- `app/api/advisor/llm/route.ts` — blijft als API-route voor LLM-aanroepen, eventueel hernoemen naar `app/api/llm/route.ts`.

**Tests die moeten worden bijgewerkt of verwijderd:**
- `tests/advisor-config-commands.test.ts` — bijwerken naar nieuwe `applyAlternativePatch`
- `tests/advisor-impact-ordering.test.ts` — vervangen door tests in `tests/alternatives.test.ts`
- `tests/advisor-phase-search.test.ts` — verwijderen, het concept "fase A/B" bestaat niet meer
- `tests/advisor-proven-strict-repeat.test.ts` — vervangen door equivalent in alternatives-test
- `tests/advisor-proves-solution-or-none.test.ts` — vervangen
- `tests/advisor-time-budget.test.ts` — verwijderen, time-budget concept verdwijnt

---

## Stap 3.4 — LLM-uitbreiding: nieuwe rol

**Wat:** herstructureer de bestaande LLM-providers (`claude.ts`, `openai.ts`, `grok.ts`) zodat ze de nieuwe rol vervullen — combinaties voorstellen die `proposeAlternatives` zelf niet genereert.

**Waar:** nieuw bestand `packages/core/src/llm-extension.ts`. De providers blijven waar ze zijn (eventueel verplaatst naar `packages/core/src/llm/providers/`).

**Type-signatuur:**

```typescript
export interface LlmExtensionInput {
  config: ConfigV2;
  feasibility: FeasibilityReport;
  deterministicTopN: Alternative[];  // wat proposeAlternatives al heeft gevonden
}

export interface LlmExtensionResult {
  alternatives: Alternative[];   // alleen geverifieerde, beter-dan-deterministisch
  rawSuggestions: number;        // hoeveel de LLM voorstelde
  rejectedAfterVerification: number;
}

export async function runLlmExtension(
  input: LlmExtensionInput,
  provider: LlmProvider
): Promise<LlmExtensionResult>;
```

**Algoritme:**

```
1. Bouw prompt:
   - Hier is de huidige config (samenvatting, niet alle velden)
   - Hier is het feasibility-rapport (lower bounds, messages)
   - Hier zijn de top-N alternatieven die we al hebben gevonden
   - Stel maximaal 5 nieuwe alternatieven voor die combinaties van wijzigingen zijn
     die wij nog niet hebben geprobeerd. Focus op 3+ dimensies tegelijk.
   - Antwoord ALLEEN als JSON met shape: { alternatives: AlternativePatch[] }
2. Stuur naar provider, parse response
3. Voor elk LLM-voorstel:
   a. patchedConfig = applyPatch(config, suggestion.apply)
   b. patchedFeasibility = analyzePlanFeasibility(patchedConfig)
   c. result = generateBestPlan(patchedConfig)
   d. accept = result.achievedScore.totalScore > best deterministic alternative
4. Return alleen geaccepteerde, gemarkeerd source: "llm"
```

**Prompt-engineering:** de prompt is **specifiek**. We vertellen de LLM niet "verzin scenario's", maar "stel combinaties voor van 3 of meer dimensies omdat onze deterministische zoektocht alleen tot 2 gaat". Dat is de zinvolle ruimte waar de LLM toegevoegde waarde heeft.

**Veiligheid:** elke LLM-output wordt **lokaal geverifieerd** via dezelfde `analyzePlanFeasibility` + `generateBestPlan` die `proposeAlternatives` zelf gebruikt. De LLM bepaalt nooit zelf of iets goed is.

**Feature-flag:** `NEXT_PUBLIC_ADVISOR_AI_PROVIDER` blijft de schakelaar. Als hij niet gezet is of `"none"`, dan wordt `runLlmExtension` nooit aangeroepen.

**Oude prompts opruimen:** de huidige `aiPrompt` functie in `advisor.ts:275-362` is geschreven voor de oude rol ("verzin patches"). Die wordt vervangen door een nieuwe prompt die de feasibility-input meeneemt en gericht om combinaties vraagt.

**Tests:** mock-only in CI, met een handmatige PR-checklist voor het echte LLM-pad.

**Mock-test (in CI):** `tests/llm-extension.test.ts` met een **mock provider** die hardcoded suggesties returnt. Deze test verifieert:
1. De verificatieloop werkt: elke LLM-suggestie wordt door `generateBestPlan` gehaald
2. Suggesties die niet beter scoren dan het beste deterministische voorstel worden gefilterd
3. De `source: "llm"` markering wordt correct gezet
4. De prompt-bouwer produceert het verwachte JSON-formaat (snapshot test)
5. Bij parser-fouten in LLM-output (bv. ongeldig JSON) wordt een lege lijst teruggegeven, geen crash

**Handmatige smoke-test (PR-checklist, eenmalig vóór merge):** in de PR-beschrijving van stap 3.4 staat een checklist die de auteur **eenmalig** doorloopt met een echte LLM-key en in de PR aftikt:

```
LLM smoke-test (uitgevoerd op [datum] door [naam]):

- [ ] `NEXT_PUBLIC_ADVISOR_AI_PROVIDER=claude` gezet, `ANTHROPIC_API_KEY` aanwezig
- [ ] Wizard: 16g/8s/split config aangemaakt, naar planner gegaan
- [ ] "Analyseer" geklikt, knop wordt grijs (loading)
- [ ] Resultaat verschijnt binnen redelijke tijd
- [ ] Minstens één alternatief heeft `source: "llm"` markering in de UI
- [ ] Het LLM-alternatief is een combinatie van 3+ dimensies (gecontroleerd in browser devtools of network tab)
- [ ] Het LLM-alternatief heeft een `achievedScore.totalScore` die hoger is dan het beste deterministische voorstel (anders zou hij niet worden getoond)
- [ ] Herhaal voor `NEXT_PUBLIC_ADVISOR_AI_PROVIDER=openai` indien beschikbaar
- [ ] Herhaal voor `NEXT_PUBLIC_ADVISOR_AI_PROVIDER=grok` indien beschikbaar
- [ ] Bij `NEXT_PUBLIC_ADVISOR_AI_PROVIDER=none`: alleen deterministische alternatieven verschijnen, geen netwerk-call naar LLM
```

Niet als CI-stap, niet als geautomatiseerde test — gewoon één menselijk moment waarop de auteur het echte pad heeft zien werken voordat de PR mergt. De checklist wordt mee-gecommit als comment in `tests/llm-extension.test.ts` zodat hij findbaar blijft voor toekomstige wijzigingen.

---

## Stap 3.5 — UI: gemeenschappelijke alternatieven-component

**Wat:** maak één React-component die zowel in de wizard als in de planner gebruikt wordt om alternatieven te tonen.

**Waar:** nieuw bestand `components/alternatives-list.tsx`.

**Props:**

```typescript
interface AlternativesListProps {
  alternatives: Alternative[];
  onApply: (alt: Alternative) => void;
  loading?: boolean;
  emptyMessage?: string;
}
```

**Rendering:**

- Loading state met spinner
- Lege staat met `emptyMessage` of een default
- Per alternatief:
  - Label (bold)
  - Reden (klein)
  - `mathMinimum === 0` → groene badge "0 herhalingen mogelijk"
  - `mathMinimum > 0` → oranje badge "min. {mathMinimum} herhalingen"
  - `achievedRepeats` indien afwijkend van `mathMinimum`: "haalt {achievedRepeats}"
  - `source === "llm"` → kleine "AI-suggestie" markering
  - "Toepassen" knop

**Hergebruik:** zowel `config-wizard.tsx` (stap 7) als `app/planner/page.tsx` (analyse-paneel) gebruiken dezelfde component met hun eigen `onApply`-handler.

---

## Stap 3.6 — Bye-toevoeging als regel in `proposeAlternatives` (alleen bij Pad B)

**Conditioneel:** alleen relevant als het beslismoment in fase 2 (stap 2.3) Pad B heeft gekozen.

**Wat:** voeg aan `enumerateCandidates` in `alternatives.ts` een gerichte regel toe die "voeg een extra ronde toe met pauze-activiteit" als kandidaat genereert voor configs waar `feasibility.byeAssistancePossible === true`.

**Implementatie:**

```typescript
// In enumerateCandidates:
if (feasibility.byeAssistancePossible && !config.pauseActivity) {
  candidates.push({
    apply: {
      addTimeslots: 1,
      addPauseActivity: "Pauze-activiteit",
    },
    cost: COST_TIMESLOT + COST_PAUSE,
    label: "+1 ronde met pauze-activiteit",
    reason: "Met een extra ronde en pauze-activiteit kan iedere groep alle spellen spelen",
  });
}
```

De rest gaat automatisch via de standaard `proposeAlternatives` flow: de patch wordt toegepast, een nieuwe config gebouwd, `analyzePlanFeasibility` herberekend, `generateBestPlan` gedraaid, en het resultaat met de echte score teruggegeven. Geen extra speciale code nodig.

---

## Stap 3.7 — Cleanup en re-exports

**Verwijderen uit `packages/core/src/index.ts`:**

```typescript
export * from "./advisor/index";  // → vervangen door alternatives + llm-extension
```

**Toevoegen:**

```typescript
export * from "./alternatives";
export * from "./llm-extension";
```

**Verwijderen van bestanden:**
- `packages/core/src/advisor/advisor.ts`
- `packages/core/src/advisor/candidates.ts`
- `packages/core/src/advisor/scoring.ts`
- `packages/core/src/advisor/feasibility.ts`
- `packages/core/src/advisor/verify.ts`
- `packages/core/src/advisor/index.ts`
- `app/api/advisor/analyze/route.ts`

**Behouden** (eventueel verplaatst):
- `packages/core/src/advisor/providers/*` → `packages/core/src/llm/providers/*` (optioneel)
- `app/api/advisor/llm/route.ts` → `app/api/llm/route.ts` (optioneel)

**`generatePlan` alias verwijderen:** in fase 1 stap 1.5 is `generatePlan` als tijdelijke alias toegevoegd met een `// TODO(fase-3)` markering. Na stap 3.2 en 3.3 zijn alle aanroepers omgezet naar `generateBestPlan`. Nu:

1. Verifieer met `grep -rn "generatePlan(" packages/ app/ components/ tests/` dat er geen aanroepers van de alias meer zijn
2. Verwijder de `generatePlan` alias-functie uit `packages/core/src/generator.ts`
3. Verwijder de `generatePlan` re-export uit `packages/core/src/index.ts`
4. Run `npm run build` — als er nog iets verwijst, fix het ter plekke (geen aliassen terugzetten)

Dit is de afspraak uit fase 1: zonder deze stap blijft de alias permanent en is de refactor mislukt.

**Documentatie bijwerken:** `docs/core-api-spec.md` aanpassen aan de nieuwe API.

---

## Stap 3.8 — Regression op alle ijkpunten end-to-end

**Wat:** controleer dat de hele keten werkt: wizard maakt config aan, planner toont plan, beide laten dezelfde alternatieven zien.

**Manual smoke test (in dev-omgeving):**

1. Start de wizard, maak een 16g/8s/split config aan, klik "Optimaliseer mijn kroegentocht" → controleer dat er alternatieven worden getoond (waaronder mogelijk de "+1 ronde met pauze" suggestie)
2. Klik "Toepassen" op één alternatief → controleer dat de wizard-state correct wordt bijgewerkt
3. Voltooi de wizard, ga naar de planner → controleer dat het plan klopt
4. Klik op "Analyseer" in de planner → controleer dat dezelfde alternatieven worden getoond als in de wizard
5. Indien LLM-provider geconfigureerd: controleer dat er ook "AI-suggestie" alternatieven verschijnen, met de juiste markering

**Automated end-to-end:** `tests/end-to-end-ijkpunten.test.ts` (nieuw):
- Voor elk van de vijf ijkpunten: bouw config met `buildConfig`, roep `proposeAlternatives` aan, controleer dat de output overeenkomt met de verwachte alternatieven uit stap 2.5.

---

## Volgorde van werken in fase 3

1. Stap 3.1 — `proposeAlternatives` implementeren met tests
2. Stap 3.5 — alternatieven-component (parallel met 3.1)
3. Stap 3.2 — wizard refactor
4. Stap 3.3 — planner refactor + cleanup van advisor-bestanden
5. Stap 3.4 — LLM-uitbreiding (parallel met 3.3 mogelijk)
6. Stap 3.6 — bye-regel in alternatives (alleen bij Pad B)
7. Stap 3.7 — finale cleanup en re-exports
8. Stap 3.8 — regression smoke test

---

## Acceptatie-checklist fase 3

- [ ] `proposeAlternatives` bestaat in `packages/core/src/alternatives.ts`
- [ ] `tests/alternatives.test.ts` slaagt
- [ ] `findNearestPerfect` bestaat niet meer in `config-wizard.tsx`
- [ ] `findProvenSolutions` bestaat niet meer in de codebase
- [ ] `generateDeterministicCandidates` bestaat niet meer
- [ ] LLM-providers werken via `runLlmExtension` met de nieuwe rol
- [ ] `tests/llm-extension.test.ts` slaagt met mock provider
- [ ] Handmatige LLM smoke-test is uitgevoerd en aangevinkt in de PR
- [ ] Wizard en planner gebruiken dezelfde `AlternativesList` component
- [ ] Alle oude advisor-bestanden zijn verwijderd
- [ ] `tests/advisor-*.test.ts` zijn ofwel verwijderd ofwel vervangen door `tests/alternatives*.test.ts`
- [ ] Bye-regel in `proposeAlternatives` is toegevoegd (alleen bij Pad B)
- [ ] **`generatePlan` alias is verwijderd** uit `generator.ts` en `index.ts`
- [ ] `grep -rn "generatePlan(" packages/ app/ components/ tests/` geeft geen resultaten meer
- [ ] Manual smoke test op de vijf ijkpunten geslaagd
- [ ] `tests/end-to-end-ijkpunten.test.ts` slaagt
- [ ] `npm test` slaagt
- [ ] `npm run build` slaagt
- [ ] `docs/core-api-spec.md` is bijgewerkt
