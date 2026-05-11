# Generator & Wizard — Unified Design

**Status:** ontwerp  
**Datum:** 2026-04-10  
**Doel:** het houtje-touwtje-geheel van twee parallelle optimalisatiesystemen (wizard + advisor), een generator die onder de motorkap maar één van vier scoringsassen optimaliseert, en verborgen strategiewissels vervangen door één helder, doordacht systeem.

Dit document beschrijft **wat** het systeem moet doen en **waarom**. Het bevat geen implementatiecode — dat volgt in een separate sprint.

---

## 1. Het domein

### 1.1 Wat is een kroegentocht?

Een kroegentocht bestaat uit:

- **Groepen** — teams van kinderen die samen het programma doorlopen
- **Spellen** (activity types) — soorten activiteiten die gespeeld kunnen worden
- **Stations** — fysieke plekken waar één spel wordt gespeeld. Een station heeft een capaciteit (standaard 2 groepen spelen tegen elkaar).
- **Locaties** — fysieke plekken waar stations staan (één veld kan meerdere stations hebben)
- **Timeslots** — rondes van vaste duur, eventueel onderbroken door een pauze
- **Pools** (optioneel) — aparte competities; groepen spelen alleen tegen groepen in hun eigen pool
- **Locatieblokken** (bij pools + "blocks"-modus) — pools zitten per blok aan één locatie vast en wisselen na de pauze
- **Pauze-activiteit** (optioneel) — een speciaal "station" waar groepen kunnen rusten of een niet-competitieve activiteit doen

### 1.2 Harde aannames (v1)

- Groepen spelen tegen elkaar → stations hebben capaciteit 2 als standaard
- Eén groep speelt per ronde maximaal op één station
- Eén station wordt per ronde gebruikt voor maximaal één match

**Capaciteit in v1:** de capaciteit per station is configureerbaar in de UI en het datamodel ondersteunt het al via `capacityGroupsMin/Max`. De generator-strategieën in deze refactor nemen echter `capacity = 2` aan als werkende aanname; ze proberen geen 1-groep- of 3+-groep allocaties te plaatsen. De architectuur (zie §2.3, `PlanStrategy`-interface) is zo opgezet dat een latere strategie variabele capaciteit kan toevoegen zonder de kern te breken — een nieuwe strategie hoeft zich alleen bij de registry te melden. Zie §8 voor wat dit expliciet niet doet.

### 1.3 De fundamentele tweedeling: spelvolledigheid vs tegenstander-volledigheid

Dit is **de belangrijkste vraag** die een gebruiker bij het aanmaken van een kroegentocht moet beantwoorden. Al het andere volgt hieruit.

#### Modus A — Spelvolledigheid (`all-spellen`)

**Belofte:** elke groep speelt elke (bereikbare) spel precies één keer.

- Aantal rondes = aantal spellen (per bereikbaar deel-set)
- **Harde eis:** geen herhaling van dezelfde spel per groep — behalve waar wiskundig onvermijdelijk
- **Geaccepteerde consequentie:** als het aantal spellen > round-robin rondes, dan speelt elk paar groepen mogelijk meerdere keren tegen elkaar (matchup-herhalingen zijn dan onvermijdelijk)

#### Modus B — Tegenstander-volledigheid (`round-robin`)

**Belofte:** elk paar groepen speelt exact één keer tegen elkaar.

- Aantal rondes = `groupsPerPool − 1`
- **Harde eis:** geen enkel paar speelt vaker dan `matchupMaxPerPair` (standaard 1)
- **Geaccepteerde consequentie:** als er meer spellen zijn dan rondes, worden sommige spellen niet gespeeld. Dat is OK.

#### Spel-repeat als harde eis binnen de gekozen modus

In **beide** modi is "een groep speelt dezelfde spel twee keer" ongewenst. De wiskunde bepaalt wanneer het onvermijdelijk is:

- **Modus A** met `split` layout en te weinig spellen per locatie kan spel-repeats forceren
- **Modus B** forceert bijna nooit spel-repeats (je hebt altijd genoeg spellen voor het beperkte aantal rondes)

**De generator schakelt nooit zelf tussen modi.** De gebruiker maakt de keuze; de generator doet het best mogelijke binnen die keuze.

---

## 2. Wat de generator moet leveren

### 2.1 Drie publieke kern-functies

```
analyzePlanFeasibility(config)  → FeasibilityReport
generateBestPlan(config)        → { plan, feasibility, achievedScore, strategyUsed, reasons }
proposeAlternatives(config)     → Alternative[]
```

Alle bestaande code (generator.ts, scoring.ts, advisor, wizard) wordt herschreven om via deze drie functies te lopen. Er bestaan geen tweede kopieën van zoekruimtes of scoringregels.

### 2.2 `analyzePlanFeasibility` — pure wiskunde

**Input:** een volledige `ConfigV2`.  
**Output:** een `FeasibilityReport` met per pool/segment de wiskundige ondergrenzen en een menselijke uitleg.

**Deze functie doet geen enkele zoektocht.** Hij rekent uit wat theoretisch haalbaar is. De strategieën in `generateBestPlan` leveren echte cijfers; deze functie zegt "hoe dicht bij het ideaal kun je komen als alles perfect meezit".

Per segment berekent hij:

- `rondesNeeded` (gegeven de gekozen modus)
- `matchesPerGroup` (hoe vaak elke groep speelt)
- `reachableActivityTypes` (hoeveel unieke spellen een groep in totaal kan bereiken — over alle blokken heen)
- `lowerBoundSpelRepeats` = max(0, `matchesPerGroup` − `reachableActivityTypes`)
- `lowerBoundMatchupCeiling` — het kleinste `matchupMaxPerPair` dat haalbaar is bij deze modus
- `algebraicFeasible` (boolean) — werkt de modulaire constructie voor deze H-waarde?
- `byeAssistancePossible` (boolean) — kan het toevoegen van byes het minimum verlagen?

Plus een `messages: string[]` met leesbare uitleg per bevinding:

> *"Pool A: elke groep speelt 8 wedstrijden maar kan maar 4 unieke spellen bereiken. Minimaal 4 herhalingen per groep. Oplossingen: voeg een extra ronde toe met pauze-activiteit (byes kunnen dan 1 herhaling opvangen) of verlaag het aantal wedstrijden per groep naar 4."*

### 2.3 `generateBestPlan` — pluggable strategieën, beste wint

**Input:** een `ConfigV2` (en optioneel `GeneratePlanOptions`).  
**Output:** het beste plan dat een van de beschikbare strategieën kan produceren, plus eerlijk rapport.

#### Strategie-interface

Een strategie implementeert:

```
interface PlanStrategy {
  name: string;
  applicable(config, feasibility): boolean;
  generate(config, feasibility): PlanAttempt | null;
}

interface PlanAttempt {
  plan: PlanV2;
  computedScore: PlanScore;
  strategy: string;
}
```

Strategieën worden in een **registry** geplaatst. `generateBestPlan` roept alle `applicable` strategieën aan, verzamelt geldige resultaten, en kiest de beste op `computedScore.totalScore`. Nieuwe strategieën worden toegevoegd aan de registry zonder kernwijzigingen.

#### Initiële strategieën (v1)

| Naam | Geschikt voor | Werking |
|---|---|---|
| **algebraic** | blocks-modus, H ∈ {3, 5, 7, 9, 11} (per pool even, geen ghost) | Huidige `constructPerfectBlock`: modulaire arithmetiek levert 0-herhalingen rooster |
| **round-robin-exact** | alle configuraties met `movementPolicy=blocks` | Huidige `assignToStationsByExactBlocks`: circle-method matches + blok-DFS voor station-toewijzing |
| **round-robin-slot** | `movementPolicy=free` | Huidige `assignToStationsBySlot`: per-slot DFS |
| **shuffled-rounds** | overal waar round-robin-exact werkt | Zelfde als round-robin-exact, maar met N gerichte rondeshuffles. Niet willekeurig: gestuurd door welke rondes een spel-conflict creëren. |
| **bye-assisted** | Modus A met oneven H of ongunstige H (4, 6, 8, 10) waar `byeAssistancePossible` geldt | Voegt een (virtueel) extra ronde toe binnen de zoekruimte waar gerichte byes de herhalingen opvangen. Alleen actief als `config.pauseActivity` is gedefinieerd of als er ruimte is om er een te maken. |

**Selectie:** alle strategieën worden geprobeerd (of bij grote configs: de eerste N applicabele in volgorde van verwachte kwaliteit, met tijdsbudget per strategie). De output van elk wordt gescoord met `computePlanScore` en de hoogste totaalscore wint.

**Geen hiërarchie.** Als `shuffled-rounds` beter scoort dan `algebraic`, wint `shuffled-rounds`. Als `bye-assisted` de enige is die 0 herhalingen bereikt, wint die.

#### Lokale repair (post-strategie)

Na elke strategie wordt een gedeelde **repair-pass** uitgevoerd die:

1. Within-slot moves en swaps (huidig gedrag)
2. **Cross-slot swaps** voor match-neutrale situaties (twee matches met dezelfde groepen die van station kunnen ruilen tussen rondes)
3. Eindigt zodra geen verbetering meer mogelijk is of een tijdsbudget is bereikt

Deze repair-functie werkt op het volledige `computePlanScore` resultaat, niet alleen op `repeatPenalty`. Cross-slot is de missende ingredient in de huidige optimizer.

### 2.4 `proposeAlternatives` — één functie voor wizard én advisor

**Input:** een `ConfigV2` (met of zonder plan). Als er een plan is, wordt dat gebruikt als baseline; anders genereert de functie zelf een baseline via `generateBestPlan`.  
**Output:** `Alternative[]`, gesorteerd op verwachte winst.

Deze functie **vervangt** `wizard.findNearestPerfect` én `advisor.generateDeterministicCandidates`. Eén bron, één sorteer-criterium, dezelfde resultaten in wizard en planner.

#### Eén alternatief bevat

```
{
  apply: AlternativePatch,       // welke wijzigingen op de config
  mathMinimum: number,           // uit analyzePlanFeasibility op de aangepaste config
  achievedScore: PlanScore,      // uit generateBestPlan op de aangepaste config
  costToUser: number,            // hoe ingrijpend is de wijziging
  reason: string,                // korte uitleg in het Nederlands
  label: string,                 // korte samenvatting voor in de UI
}
```

#### Dimensies die worden gevarieerd

1. **Aantal groepen** — gericht richting "nice H" waarden (6, 10, 14, 18, 22 per pool voor de algebraic strategie)
2. **Aantal spellen** — richting `reachableActivityTypes ≥ matchesPerGroup` (zodat `lowerBoundSpelRepeats = 0`)
3. **Pool-herverdeling** (als `usePools`) — 9+7 vs 8+8 etc.
4. **Layout** — `same ↔ split`
5. **Extra tijdslot(s)** met optionele pauze-activiteit
6. **Movement policy** — `free ↔ blocks`
7. **Pauze-activiteit toevoegen** zonder andere wijzigingen
8. Combinaties van maximaal 2 dimensies tegelijk, onder een instelbaar cost-budget

#### Sortering

1. Eerst: alternatieven waar `mathMinimum === 0` en `achievedScore.totalScore` hoog
2. Daarna: laagste `mathMinimum`
3. Bij gelijk: hoogste `achievedScore.totalScore`
4. Bij gelijk: laagste `costToUser`

#### Transparantie

Voor élk voorstel wordt **het echte plan gegenereerd** en gescoord — geen voorspellingen op basis van heuristieken. De `achievedScore` is wat de gebruiker daadwerkelijk gaat krijgen als hij het voorstel toepast.

---

## 3. Scoring (`computePlanScore`)

### 3.1 Vier metrics, nu werkelijk geoptimaliseerd

De huidige scoring meet vier dingen, maar de generator optimaliseert maar één. In het nieuwe ontwerp gaan strategieën én repair dezelfde score gebruiken als cost-functie. De metrics zijn:

| Metric | Wat | Bereik |
|---|---|---|
| `spelRepeatPenalty` | Hoeveel spel-herhalingen boven het wiskundige minimum? | 0 = perfect |
| `matchupCeilingPenalty` | Hoeveel paren overschrijden `lowerBoundMatchupCeiling`, en met hoeveel? | 0 = perfect |
| `stationOccupancy` | Fractie van (allowed) stations die per ronde bezet zijn | 1 = alle stations gebruikt |
| `spelVariety` | Fractie unieke spellen per groep | 1 = elke groep speelt alles wat bereikbaar is |

### 3.2 Normalisatie tegen wiskundige ondergrens

Het huidige probleem is dat `repeatPenalty` wordt genormaliseerd tegen `groups × activeSlots` — een veel te royale noemer waardoor het verschil tussen "ramp" en "perfect" verdwijnt in de ruis.

**Nieuwe normalisatie:**

```
spelRepeatPenalty = max(0, actualRepeats - lowerBoundSpelRepeats)
normalizedRepeat   = 1 - spelRepeatPenalty / max(1, maxUsefulRepeats)
```

Waar `maxUsefulRepeats` het worst-case realistisch scenario is (bv. `matchesPerGroup − 1` per groep). Zo geeft "0 boven minimum" een duidelijke 1.0, en "1 boven minimum" een zichtbaar lagere score.

### 3.3 `matchupCeilingPenalty` vervangt `matchupFairness`

De huidige `matchupFairness = 1 − (stddev/mean)` beloont gelijke spreiding — ook als die spreiding hoog is. Dat is fout: we willen een plafond.

```
matchupCeilingPenalty = sum(max(0, pairCount[p] - lowerBoundMatchupCeiling) for p in pairs)
normalizedCeiling     = 1 - matchupCeilingPenalty / max(1, maxPairs)
```

Bij Modus B met `matchupMaxPerPair = 1`: elke paar dat vaker dan 1× speelt, krijgt een strafpunt per extra keer. Bij Modus A: het plafond ligt hoger (`ceil(rondes / (poolSize-1))`), maar het principe blijft gelijk.

### 3.4 Gewichten per modus

**Modus A (spelvolledigheid):**

```
spelRepeatPenalty:    5.0  // hard
spelVariety:          3.0  // belangrijk: de belofte
matchupCeilingPenalty: 1.5  // soft: geaccepteerd dat dit niet perfect is
stationOccupancy:      1.0
```

**Modus B (tegenstander-volledigheid):**

```
matchupCeilingPenalty: 5.0  // hard: de belofte
spelRepeatPenalty:    3.0  // belangrijk
spelVariety:          1.5  // soft: acceptabel dat sommige spellen niet gespeeld worden
stationOccupancy:      1.0
```

De gebruiker ziet niet deze getallen — hij kiest de modus, de generator kiest de gewichten die bij die belofte passen.

### 3.5 Harde vs zachte constraints

Sommige metrics zijn harde grenzen in de validator (niet te overschrijden):

- `DOUBLE_BOOKING_GROUP`, `STATION_OVERBOOKED`, `CAPACITY_MISMATCH`, `CROSS_SEGMENT_MATCH`, `BREAK_SLOT_HAS_ALLOCATIONS`: altijd hard
- `DUPLICATE_MATCHUP`: hard in Modus B, soft (alleen score) in Modus A
- `REPEAT_ACTIVITYTYPE_FOR_GROUP`: soft (zware penalty) tenzij `constraints.avoidRepeatActivityType === "hard"`

**De validator blijft bestaan** voor eindcheck. De generator gebruikt de scoring om te sturen en de validator om te verifiëren.

---

## 4. Feasibility: de wiskundige waarheid

### 4.1 Wat betekent "haalbaar"?

Voor elke gewenste uitkomst berekent `analyzePlanFeasibility` één getal: de wiskundige ondergrens voor die uitkomst bij deze config. Bijvoorbeeld:

- `lowerBoundSpelRepeats`: hoeveel spel-herhalingen zijn **minimaal onvermijdelijk**?
- `lowerBoundMatchupCeiling`: welk max-per-paar is **minimaal haalbaar** gegeven het aantal rondes en poolgrootte?

Als een gebruiker `0 herhalingen` wil en `lowerBoundSpelRepeats > 0`: dat is bewijsbaar onhaalbaar, en we zeggen dat eerlijk.

### 4.2 De "nice H" ontdekking

Uit de deep-dive blijkt dat de algebraïsche constructie werkt voor specifieke H-waarden (3, 5, 7, 9, 11, ...). Dit is een eigenschap van de wiskunde, geen feature die we bouwen. `analyzePlanFeasibility` gebruikt dit inzicht in zijn `algebraicFeasible` vlag, en `proposeAlternatives` gebruikt dit om gerichte suggesties te doen:

> *"16 groepen / 2 pools → 8 per pool → H=4 is een ongelukkig getal. Met 14 of 18 groepen (7 of 9 per pool) vind je een perfecte configuratie zonder herhalingen."*

Dit is **eerlijk** advies: we weten waarom het werkt en we zeggen het.

### 4.3 Bye-assistance in de feasibility-analyse

Voor "lelijke" H-waarden (4, 6, 8, 10) waar algebraic niet werkt én round-robin herhalingen forceert, kan een extra ronde met bye's helpen:

- Eén extra ronde + pauze-activiteit geeft de zoekruimte N extra rondes × (stations+1 stationsopties)
- Bye-allocaties zijn "gratis" — ze veroorzaken geen herhaling, want de pauze is een aparte activity type
- In ronde R kan de generator bewust één groep laten rusten om een spel-herhaling te voorkomen

`analyzePlanFeasibility` berekent of bye-assistance het `lowerBound` verlaagt, en `proposeAlternatives` stelt het voor als concrete optie.

---

## 5. Integratie met wizard en planner

### 5.1 Wizard — bij aanmaken van een kroegentocht

De wizard (stappen 1–8) verzamelt keuzes. Bij elke relevante stap wordt `analyzePlanFeasibility` aangeroepen op de huidige (tijdelijke) config, en de resultaten worden real-time getoond:

- **Modus-keuze** (nieuw / verscherpt): "Wat is voor jou het belangrijkst — dat elke groep alle spellen speelt, of dat iedereen tegen iedereen speelt?"
- **Stap groepen**: toont direct "met 8 groepen per pool krijg je minimaal X herhalingen — kies 6 of 10 voor een perfecte configuratie"
- **Stap spellen**: toont direct "met 5 spellen per veld in Modus A krijg je Y minimale herhalingen"
- **Stap 7 (je kroegentocht)**: de "Optimaliseer mijn kroegentocht" knop roept `proposeAlternatives` aan en toont de top 5 alternatieven.

De wizard heeft geen eigen optimalisatielogica meer. Alle berekeningen komen uit de drie kern-functies.

### 5.2 Planner — bij bekijken van een bestaand plan

De "Analyseer"-knop in de planner roept `proposeAlternatives` aan op het huidige plan. De resultaten worden getoond in dezelfde UI-component als de wizard-alternatieven. Dezelfde data, dezelfde getallen, dezelfde uitleg.

De "Genereer opnieuw"-knop roept `generateBestPlan` aan en toont het resultaat met de gerapporteerde strategie en een eerlijke vergelijking met het wiskundige minimum.

### 5.3 LLM als optionele uitbreiding (alleen in de planner)

Naast de deterministische `proposeAlternatives` bestaat er een **optionele LLM-uitbreiding** die alleen vanuit de planner aangeroepen wordt, alleen op expliciete actie van de gebruiker, en alleen als `NEXT_PUBLIC_ADVISOR_AI_PROVIDER` is geconfigureerd.

**Rol van de LLM:** combinaties voorstellen die de deterministische zoektocht zelf niet genereert, omdat die per ontwerp tot maximaal 2 dimensies tegelijk varieert (zie §2.4). De LLM mag combinaties van 3+ dimensies voorstellen, bijvoorbeeld "verlaag groepen naar 14 én voeg 1 spel toe én flip de layout én voeg een bye-ronde toe".

**Wat de LLM krijgt als input:**

- De huidige `ConfigV2`
- Het volledige `FeasibilityReport` uit `analyzePlanFeasibility`
- De top-N alternatieven die `proposeAlternatives` zelf al heeft gevonden (zodat de LLM weet wat de deterministische kant al biedt en niet hoeft te dupliceren)

**Wat de LLM produceert:** een lijst voorstellen in hetzelfde `AlternativePatch` formaat dat `proposeAlternatives` gebruikt — niets meer.

**Wat de LLM expliciet niet doet:**

- Geen plannen genereren
- Geen uitspraken over haalbaarheid die gevolgd worden zonder verificatie
- Geen beslissingen
- Niet in het kritieke pad: als de LLM uitvalt of niet geconfigureerd is, blijft de hele applicatie werken

**Verificatieloop:**

1. LLM produceert N voorstellen
2. Voor elk voorstel: bouw de aangepaste config, draai `analyzePlanFeasibility`, draai `generateBestPlan`
3. Filter alle voorstellen weg waar `achievedScore.totalScore` niet beter is dan het beste voorstel dat `proposeAlternatives` zelf al had gevonden
4. De rest wordt getoond in dezelfde UI-component, met een visuele markering "AI-suggestie" voor transparantie

Een LLM-voorstel komt dus nooit binnen zonder dat de wiskunde het bevestigt, en nooit boven een deterministisch voorstel uit als de wiskunde het deterministische voorstel beter vindt. De LLM is een **aanvulling** op de deterministische zoektocht, niet een vervanging.

**De wizard roept de LLM niet aan.** Bij het aanmaken van een kroegentocht is real-time feedback belangrijker dan diepte; LLM-latency past daar niet bij. De LLM-uitbreiding bestaat alleen achter de "Analyseer"-knop in de planner.

### 5.4 Geen divergentie meer

- Eén definitie van `computePlanScore`
- Eén implementatie van `analyzePlanFeasibility`
- Eén implementatie van `proposeAlternatives`
- Eén implementatie van `generateBestPlan`
- LLM-uitbreiding gebruikt diezelfde implementaties voor verificatie — geen tweede kandidaat-pijplijn

Er zijn geen twee paden die "hetzelfde bedoelen" met verschillende drempels of filters.

---

## 6. Opruimen: wat verdwijnt en wat verandert

Als onderdeel van deze refactor wordt het volgende verwijderd of samengevoegd:

1. `components/config-wizard.tsx → findNearestPerfect` (wordt wrapper om `proposeAlternatives`)
2. `packages/core/src/advisor/candidates.ts → generateDeterministicCandidates` (wordt vervangen door `proposeAlternatives`)
3. Lege catch-block in `optimizeExistingPlanStations` → gooit nu een heldere error met logging
4. Misleidende sub-blok comments (`subMs = maxBlockSearchMs`) → code + comment worden consistent
5. `perturbPlanForRestart` random rotatie → vervangen door gerichte perturbatie die alleen valide states creëert
6. `tryAlgebraicPlan` → wordt een gewone strategie in de registry, niet een vooraf-pad met `if (algebraicScore > standardScore)` in `generatePlan`
7. `matchupFairness` als spreidingsmaat → vervangen door `matchupCeilingPenalty`
8. `repeatPenalty` normalisatie tegen `groups × activeSlots` → vervangen door normalisatie tegen `lowerBoundSpelRepeats`
9. Het oude `findProvenSolutions` pad in `advisor.ts` met zijn brute-force kandidaat-pijplijn → vervangen door `proposeAlternatives` als bron, en de LLM-providers worden hergebruikt als optionele uitbreiding (zie §5.3)
10. De aparte "Analyseer met Claude"-knop (`/api/advisor/analyze`) in `app/planner/page.tsx` → samengevoegd met de "Analyseer"-knop, die nu altijd `proposeAlternatives` aanroept en optioneel de LLM-uitbreiding er bovenop draait
11. `relaxedBlockTimeslotIds` veld op `ConfigV2` → behouden in v1 (komt voor in opgeslagen dev-data), maar bekijken of het echt waarde toevoegt; mogelijk verwijderd in een latere opruim-pass
12. `swapByes` advisor command → behouden zolang Pad A vs Pad B uit fase 2 nog niet gekozen is. Bij Pad A: blijft als low-level operatie. Bij Pad B: wordt onderdeel van het bye-toevoeging voorstel.

---

## 7. Migratie-strategie

Het platform draait alleen in development. Er zijn geen productiegebruikers, geen migratiezorgen, en geen reden om "geen gedragswijziging" als acceptatiecriterium op te leggen. Drie fases volstaan.

### Fase 1 — Foundations + scoring

**Doel:** de drie kern-bouwstenen leggen waarop alles bouwt, inclusief de nieuwe scoring direct in plaats van achter een feature-flag.

1. Schrijf `analyzePlanFeasibility(config) → FeasibilityReport` met test coverage tegen brute-force resultaten voor de zes ijkpuntconfiguraties (8g/4s, 10g/5s, 12g/6s, 16g/8s, 18g/10s, 20g/10s).
2. Vervang `computePlanScore` door de nieuwe implementatie: modus-afhankelijke gewichten, scherpere repeat-normalisatie tegen `lowerBoundSpelRepeats`, `matchupCeilingPenalty` in plaats van `matchupFairness`. Geen feature-flag.
3. Werk bestaande scoring-tests bij naar de nieuwe formule. Score-veranderingen documenteren met uitleg waarom — geen blinde herkalibratie.
4. Maak de `PlanStrategy` interface en registry. Migreer bestaande strategieën één voor één: `tryAlgebraicPlan`, `assignToStationsByExactBlocks`, `assignToStationsBySlot`. Pure verpakking, geen logica-wijzigingen.
5. Migreer `generatePlan` naar `generateBestPlan` die de registry aanroept en de beste teruggeeft op de nieuwe scoring.

**Acceptatie:** alle tests slagen op de nieuwe scoring. Voor de vijf ijkpuntconfiguraties is het gedrag gelijk aan of beter dan vóór de refactor.

**Risico:** laag. Mechanisch werk plus één scherpere scoring-formule.

### Fase 2 — Nieuwe strategieën + bye-beslismoment

**Doel:** de zoekruimte uitbreiden zodat het wiskundige minimum voor "lelijke" H-waarden bereikbaar wordt.

6. Bouw `shuffled-rounds` strategie — gerichte ronde-shuffles op basis van waar herhalingen ontstaan, niet de huidige brute-force seed-search.
7. Breid de repair-pass uit met cross-slot swaps (matchup-neutrale verplaatsingen tussen rondes binnen één segment).
8. **Beslismoment bye-assistance** (zie §9): bouw een prototype van `bye-assisted` als generator-strategie en meet (a) of hij het wiskundige minimum bereikt voor 16g/8s en 16g/10s, en (b) of hij binnen het tijdsbudget convergeert. Resultaat bepaalt de uitkomst:
   - **Pad A — strategie**: `bye-assisted` wordt opgenomen in de registry naast de andere strategieën.
   - **Pad B — voorstel**: het prototype wordt verwijderd; in plaats daarvan krijgt `proposeAlternatives` in fase 3 een gerichte regel die "voeg een extra ronde toe met pauze-activiteit" aanbiedt voor de "lelijke" H-waarden, met de echte achievedScore via `generateBestPlan` op de aangepaste config.
   
   Het prototype wordt achter een feature-flag gebouwd zodat de keuze niet onomkeerbaar is. De keuze, met meetresultaten, wordt vastgelegd in een korte notitie in `docs/` voordat fase 2 wordt afgesloten.

**Acceptatie:** 16g/8s/split haalt het wiskundige minimum (4 per blok = max 8 totaal) — via Pad A direct, of via Pad B na toepassing van een door `proposeAlternatives` gesuggereerde wijziging. Regression test op alle vijf ijkpuntconfiguraties.

**Risico:** middel. Zoekruimte-uitbreiding kan trager zijn dan acceptabel; daarom het feature-flag prototype voor bye-assistance.

### Fase 3 — Unified advies + LLM-uitbreiding

**Doel:** wizard en planner laten samenkomen in één bron van waarheid, en de bestaande LLM-functionaliteit verplaatsen van parallel pad naar optionele uitbreiding bovenop `proposeAlternatives`.

9. Implementeer `proposeAlternatives(config) → Alternative[]` met de dimensies en sortering uit §2.4.
10. Vervang `findNearestPerfect` in de wizard door wrapper rond `proposeAlternatives`.
11. Vervang `findProvenSolutions` + `generateDeterministicCandidates` in de planner door wrapper rond `proposeAlternatives`.
12. **LLM-uitbreiding** (zie §5.3): herstructureer de bestaande LLM-providers (`claude.ts`, `openai.ts`, `grok.ts`) zodat ze de nieuwe rol vervullen — combinaties voorstellen die `proposeAlternatives` zelf niet genereert. Input van de LLM: huidige config + `FeasibilityReport` + top-N alternatieven. Output: `AlternativePatch[]` die lokaal worden geverifieerd via `analyzePlanFeasibility` + `generateBestPlan` en alleen worden getoond als ze beter zijn dan het beste deterministische voorstel.
13. Voeg de "AI-suggestie"-markering toe in de UI-component die alternatieven toont, zodat deterministische en LLM-voorstellen visueel onderscheidbaar zijn.
14. Verwijder de oude `/api/advisor/analyze` endpoint en de aparte "Analyseer met Claude"-knop in de planner. Alle LLM-functionaliteit loopt nu via de "Analyseer"-knop.
15. Verwijder dode code uit de opruimlijst (§6).
16. Bij Pad B uit fase 2: voeg de bye-toevoeging als gerichte regel toe in `proposeAlternatives`.

**Acceptatie:** wizard en planner geven voor dezelfde config dezelfde voorstellen met dezelfde getallen. De LLM-uitbreiding werkt achter zijn feature-flag (`NEXT_PUBLIC_ADVISOR_AI_PROVIDER`) en levert in test-runs combinaties op die de deterministische zoektocht niet had gevonden — én die na verificatie inderdaad beter scoren. Manual smoke test op de vijf ijkpuntconfiguraties.

**Risico:** middel. Het samenvoegen van wizard- en planner-paden kan UI-state-bugs creëren; de LLM-rolverandering vraagt nieuwe prompts die anders zijn dan de huidige.

---

## 8. Wat dit expliciet **niet** doet

- **Geen nieuwe LLM-provider integraties.** De bestaande providers (`claude.ts`, `openai.ts`, `grok.ts`) krijgen een nieuwe rol (combinatie-voorsteller in plaats van vrij scenario-bedenker, zie §5.3) maar er komen geen nieuwe providers bij.
- **Geen variabele capaciteit > 2.** Het datamodel ondersteunt het al via `capacityGroupsMin/Max`; de strategieën in deze refactor nemen cap=2 aan. Een latere strategie kan dit toevoegen zonder de kern te wijzigen — zie §1.2.
- **Geen nieuwe UI-componenten van de grond af.** De wizard-stappen en planner-knoppen blijven structureel hetzelfde; alleen de logica erachter verandert plus enkele kleine UI-wijzigingen (modus als eerste-klas keuze, "AI-suggestie"-markering op alternatieven).
- **Geen wijzigingen in model.ts / schema.** `ConfigV2` en `PlanV2` blijven intact. `relaxedBlockTimeslotIds` blijft in v1 staan tot we na fase 3 kunnen evalueren of het waarde toevoegt.
- **Geen multi-day of cross-day features.** Buiten scope.

---

## 9. Open vragen / risico's

- **Runtime-budget voor meerdere strategieën parallel:** hoe verdelen we het totale tijdsbudget als we nu 4-5 strategieën proberen per aanroep? Voorstel: alle applicable strategieën krijgen gelijk budget, met een gedeeld totaal van ~2 seconden. Te valideren in benchmarks.
- **Bye-assisted: strategie of voorstel?** Het toevoegen van virtuele rondes met byes vergroot de zoekruimte van de generator. Het is op dit moment niet zeker dat dit binnen het tijdsbudget convergeert voor de "lelijke" H-waarden. Dit risico heeft een eigenaar: het wordt opgelost in **fase 2 stap 6** als expliciet beslismoment op basis van een prototype-meting. Tot die meting beschikbaar is, behandelen we beide opties (Pad A: strategie in de registry; Pad B: gerichte regel in `proposeAlternatives`) als gelijkwaardige kandidaten. De keuze + meetresultaten worden vastgelegd in een korte notitie in `docs/` voordat fase 2 wordt afgesloten.
- **Testdata voor feasibility:** we hebben geen formele test-fixtures voor de wiskundige ondergrens. Die moet komen uit brute-force voor kleine configs (8g/4s, 10g/5s, 12g/6s, 16g/8s, 18g/10s, 20g/10s) en handmatige verificatie.
- **Modus-keuze in de UI:** de wizard heeft al een `scheduleMode` keuze, maar die wordt nu pas getoond als `spellenExceedRounds`. In het nieuwe ontwerp is de modus een **eerste-klas** keuze, altijd zichtbaar. Dat is een UI-wijziging die we in de migratie moeten meenemen.

---

## 10. Succescriteria

Deze refactor is geslaagd als:

1. Voor elke van deze ijkpuntconfiguraties leveren wizard en planner dezelfde getallen, en `generateBestPlan` bereikt het wiskundige minimum (of de reden waarom niet wordt eerlijk gerapporteerd):
   - `12g/6s/split/blocks/2loc` — verwacht 0 herhalingen (algebraic)
   - `16g/8s/split/blocks/2loc` — verwacht minimum 4 per blok; bye-assisted kan dit verder verlagen
   - `16g/10s/split/blocks/2loc` — verwacht minimum ≤ 8; bye-assisted gewenst
   - `18g/10s/split/blocks/2loc` — verwacht minimum ≤ 6 (oneven pool; hasGhost)
   - `20g/10s/split/blocks/2loc` — verwacht 0 herhalingen (algebraic)

2. De wizard toont bij elke stap eerlijk wat wiskundig haalbaar is en stelt gerichte wijzigingen voor wanneer iets onhaalbaar is.

3. De planner toont bij een bestaand plan exact dezelfde getallen en voorstellen als de wizard zou geven voor diezelfde config.

4. `components/config-wizard.tsx` heeft geen eigen optimalisatielogica meer — het is puur UI rond `proposeAlternatives` en `analyzePlanFeasibility`.

5. Er is geen dode code meer in `generator.ts` (lege catch, misleidende comments).

6. De algebraïsche constructie is een van meerdere strategieën, niet een aparte branch in `generatePlan`.
