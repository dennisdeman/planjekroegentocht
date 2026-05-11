# UX Redesign — Versimpelde opslag-flow

## Kernprincipe

**Geen draft. Geen localStorage-tussenopslag. Gewoon opslaan of niet opslaan.**

---

## Nieuwe flow

### Configurator
1. Gebruiker maakt configuratie (wizard, sjabloon, handmatig)
2. Klikt "Genereer" → config wordt **automatisch opgeslagen** naar cloud + plan wordt gegenereerd
3. → Navigatie naar planner met het gegenereerde plan

### Planner
4. Planning opent → geen wijzigingen → navigeer weg → **niks vragen**
5. Wijziging gemaakt (advies toepassen, drag-drop, opnieuw genereren) → `dirty: true`
6. Navigeer weg met wijzigingen → **"Wil je de huidige planning opslaan? Ja/Nee"**
7. Keuze gemaakt → door naar waar de gebruiker heen wilde

### Configurator (terug vanuit planner)
8. "Terug naar configurator" knop op planner → laadt de opgeslagen config
9. Wijzigingen aan config → klikt "Genereer" → config opgeslagen + nieuw plan gegenereerd
10. Wijzigingen aan config → navigeert weg → **"Wil je de configuratie opslaan? Ja/Nee"**

### Dashboard
11. Toont opgeslagen configs en plannen
12. Klik op config → opent configurator met die config
13. Klik op plan → opent planner met dat plan

---

## Wat verandert

### Weg:
- `scheduleDraftSave()` — weg
- `loadDraft()` — weg
- `clearDraft()` — weg
- `DRAFT_KEY` localStorage — weg
- `draftTimer` — weg
- Draft-herstel in `init()` — weg
- `loadInlineDraft()` — vervangen door directe state-update
- `beforeunload` draft logica — weg (alleen nog opslaan-prompt)

### Nieuw:
- `generatePlan()` slaat config **automatisch** op voordat het plan genereert
- `dirty` flag alleen nog op de **planner** (na wijzigingen aan plan)
- Configurator heeft eigen `configDirty` flag (na wijzigingen die nog niet gegenereerd/opgeslagen zijn)
- Simpele "Opslaan? Ja/Nee" prompt — geen "Opslaan en doorgaan" / "Niet opslaan" / "Annuleren" meer

### Navigatie:
- "Configurator" in menu → laadt de huidige/laatst-geopende config
- "Planner" in menu → laadt het huidige/laatst-gegenereerde plan (of "Geen planning" melding)
- "Terug naar configurator" knop op planner → navigeert naar /configurator met huidige configId

---

## Gedetailleerde wijzigingen per bestand

### `lib/planner/store.ts`
1. Verwijder: `scheduleDraftSave`, `loadDraft`, `clearDraft`, `DRAFT_KEY`, `draftTimer`
2. `generatePlan()`: voeg `saveCurrent()` toe VOOR generatie (sla config op)
3. `init()`: geen draft-herstel meer, alleen `refreshDashboard()`
4. `updateConfig()`: geen `scheduleDraftSave` meer, alleen `dirty: true`
5. `newConfig()`: geen `clearDraft()`, gewoon reset state
6. `loadConfig()`: geen `clearDraft()`, gewoon laden
7. `loadPlan()`: geen `clearDraft()`, gewoon laden
8. Voeg `configDirty` flag toe (voor configurator wijzigingen)

### `app/(app)/configurator/page.tsx`
1. "Genereer" knop: `await saveCurrent()` → `generatePlan()` → `router.push("/planner")`
2. Navigatie weg met `configDirty`: "Wil je de configuratie opslaan?"
3. Geen draft-gerelateerde logica meer

### `app/(app)/planner/page.tsx`
1. "Terug naar configurator" knop toevoegen
2. Navigatie weg met `dirty`: "Wil je de planning opslaan?"
3. Geen draft-gerelateerde logica meer

### `components/unsaved-changes-guard.tsx`
1. Versimpel: alleen "Opslaan? Ja/Nee" — geen drie opties meer

### `app/(app)/dashboard/page.tsx`
1. Verwijder "Huidige bewerking" draft-sectie (als die er is)
2. Toon alleen opgeslagen configs en plannen

---

## Implementatievolgorde

1. **Store opschonen**: Draft-systeem verwijderen
2. **generatePlan() aanpassen**: Auto-save config
3. **UnsavedChangesGuard versimpelen**: Ja/Nee prompt
4. **Configurator aanpassen**: configDirty + opslaan-prompt
5. **Planner aanpassen**: "Terug naar configurator" knop
6. **Dashboard opschonen**: Geen draft-sectie meer
7. **Testen**: Alle flows doorlopen
