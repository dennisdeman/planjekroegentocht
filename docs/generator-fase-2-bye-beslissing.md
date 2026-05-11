# Fase 2 — Bye-assistance: beslismoment

**Datum:** 2026-04-12  
**Beslissing:** Pad B (voorstel via `proposeAlternatives`)

## Meetresultaten

### Bye-assisted als strategie in de registry (Pad A)

| Config | Repeats zonder bye | Repeats met bye | Bye-score | Standaard-score | Winnaar |
|---|---|---|---|---|---|
| 12g/6s | 4 | n/a (algebraic feasible → niet applicable) | — | 9.92 | standaard |
| 16g/8s | 10 | **4** | 9.83 | 9.88 | standaard (matchup penalty domineert) |
| 16g/10s | 2 | **0** | 9.60 | 9.77 | standaard |
| 18g/10s | 0 | n/a (oneven pool) | — | 9.87 | standaard |
| 20g/10s | 8 | n/a (algebraic feasible) | — | 10.14 | standaard |

### Problemen bij Pad A

1. **Bye-assisted wint nooit op totaalscore.** De extra ronde introduceert matchup-overschrijdingen die in round-robin modus (gewicht 5.0) zwaarder wegen dan de spel-repeat-verbetering (gewicht 3.0).

2. **Plan/config-incompatibiliteit.** Het bye-assisted plan bevat allocaties in een timeslot (`bye-extra-slot`) en op stations (`station-pause-bye-*`) die niet in de originele `ConfigV2` bestaan. Dit breekt:
   - `validatePlan` (onbekende stations/timeslots)
   - `computeStationOccupancy` (verkeerde denominators)
   - `generatePlan` alias (aanroepers verwachten een plan consistent met de input-config)
   - Alle tests die `generatePlan` → `validatePlan` doen op de originele config

3. **Ghost-groepen.** Het ghost-group mechanisme (pool + 1 virtuele groep → oneven → byes) verandert de round-robin matchstructuur fundamenteel. De matches zijn anders dan bij de standaard round-robin, wat de vergelijkbaarheid vertroebelt.

### Waarom Pad B beter is

Bij Pad B stelt `proposeAlternatives` (fase 3) de gebruiker expliciet voor: "voeg 1 extra ronde toe met pauze-activiteit". De gebruiker past de config aan (nieuw timeslot, blok-uitbreiding, pauseActivity), en daarna genereert `generateBestPlan` op die aangepaste config. Het resultaat:

- Plan en config zijn consistent — geen filtering, geen ghost-groepen
- De scoring vergelijkt plannen op dezelfde config — appels met appels
- De gebruiker ziet eerlijk: "met 8 rondes in plaats van 7 krijg je 4 herhalingen i.p.v. 10"
- Geen structurele wijzigingen nodig in `generateBestPlan` of de `generatePlan` alias

### Wat bewaard blijft

- `packages/core/src/strategies/bye-assisted.ts` blijft bestaan als geëxporteerd bestand (maar niet in `STRATEGY_REGISTRY`). Fase 3 kan het gebruiken als basis voor het `proposeAlternatives` voorstel.
- De meetresultaten hierboven zijn de ground truth voor wat bye-assistance oplevert bij deze ijkpunten.

### Feasibility-inzicht

De `lowerBoundSpelRepeats` in `analyzePlanFeasibility` is 0 voor alle ijkpunten. De brute-force meting laat zien dat het werkelijke minimum voor 16g/8s ~4 per pool is (totaal ~8). Dit verschil komt doordat de feasibility-ondergrens geen rekening houdt met match-structuur constraints. Een match-structure-aware ondergrens (Latin square / edge-coloring) valt buiten scope van v1 — de documentatie in `feasibility.ts` is bijgewerkt om dit eerlijk te communiceren.
