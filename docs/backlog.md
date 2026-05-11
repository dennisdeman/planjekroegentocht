# Kroegentocht Planner Backlog

## Epic 0: Foundations (datamodel + validatie + lokale opslag)

### Story E0-S1: Datamodel v2 met generieke allocaties
Als planner wil ik dat een allocation meerdere groepen kan bevatten zodat solo, match en multi-group met hetzelfde model werken.

Acceptance criteria:
- `Allocation.groupIds` is verplicht en is een array.
- Backward compatibility: bestaande single-group data wordt gemigreerd naar `groupIds=[groupId]`.
- `Timeslot` bevat `label` en `kind` (`active|break|custom`).
- `ActivityDef` bevat `category` (`game|station|break`).
- `Allocation` ondersteunt optioneel `resourceId`.
- `Resource` entity is aanwezig voor velden/courts/ruimtes.

### Story E0-S2: Validator v1 (hard conflicts)
Als planner wil ik realtime foutmeldingen zodat ik illegale planning direct zie.

Acceptance criteria:
- Validator detecteert `double_booking_group`.
- Validator detecteert `capacity_mismatch` op basis van activity min/max.
- Validator detecteert onbekende referenties (`unknown_*`).
- Validator geeft per issue `severity`, `type`, `message` en context terug.
- Validator draait in O(n)-stijl met indexes per timeslot.

### Story E0-S3: Lokale persistence (Config + Plan versies)
Als gebruiker wil ik mijn planning kunnen sluiten en later verder gaan.

Acceptance criteria:
- Config en Plan zijn afzonderlijk op te slaan en te laden.
- Plan heeft `version` en `changelog`.
- Autosave draait bij planwijzigingen.
- Bij laden blijft schema visueel en logisch gelijk aan vóór opslaan.

## Epic 1: MVP generator + planner table view

### Story E1-S1: Config wizard basis
Als gebruiker wil ik via stappen een planning kunnen opzetten.

Acceptance criteria:
- Wizard bevat stappen voor deelnemers, groepsregels, activiteiten en tijdsinstellingen.
- Wizard ondersteunt toggle `multiGroupEnabled`.
- Wizard ondersteunt `groupsPerActivity` fixed/range.
- Validatie voorkomt starten zonder minimale configuratie.

### Story E1-S2: Generator mode A (classic rotatie)
Als planner wil ik automatisch een conflictvrije rotatie krijgen voor solo activiteiten.

Acceptance criteria:
- Generator gebruikt vaste timeslots op basis van totale tijd en duur.
- Eén groep staat nooit dubbel in hetzelfde timeslot.
- Hard conflicts zijn 0 bij succesvolle generatie.
- Onplaatsbare groepen worden als idle gemarkeerd en niet genegeerd.

### Story E1-S3: Planner table + issue panel
Als gebruiker wil ik planning per timeslot x activiteit kunnen bekijken en problemen zien.

Acceptance criteria:
- Table view toont cellen met allocations.
- Cellen ondersteunen meerdere group chips.
- Break slots zijn visueel onderscheidbaar.
- Issue panel toont alle validator issues met klikbare context.

### Story E1-S4: Handmatig bewerken zonder drag/drop
Als planner wil ik met knoppen kunnen verplaatsen en swappen zodat ik zonder hergeneratie kan corrigeren.

Acceptance criteria:
- Commands `moveGroup`, `swapGroups`, `changeTimeslot`, `createAllocation`, `deleteAllocation` werken.
- Na elke command wordt gevalideerd en UI direct geüpdatet.
- Wijzigingen beïnvloeden alleen huidige planstate, geen volledige regenerate.

## Epic 2: UX prioriteit 1 (drag/drop + import + export)

### Story E2-S1: Drag/drop met conflictfeedback
Als gebruiker wil ik groepen slepen zodat bewerken sneller gaat.

Acceptance criteria:
- Groepchip is draggable binnen planner.
- Drop in cel voegt toe als capacity het toelaat.
- Drop op chip triggert swap.
- Illegale drop toont rode highlight + reden.
- Productkeuze ingesteld: snap-back of allow-with-error (configurable).

### Story E2-S2: Bulk import deelnemers + auto-groepen
Als gebruiker wil ik deelnemers uit spreadsheet kunnen importeren.

Acceptance criteria:
- Import ondersteunt CSV upload en plakken.
- Parser herkent `,`, `;`, `TAB`.
- Kolommen naam, klas/afdeling, niveau worden ondersteund.
- Auto-groepen houden rekening met fixed/range groepsregels.

### Story E2-S3: Print/PDF export (HTML print)
Als organisator wil ik schema’s kunnen uitdelen.

Acceptance criteria:
- Export biedt keuze per timeslot of per activiteit.
- Break slots worden expliciet weergegeven.
- Print CSS is geoptimaliseerd voor A4.
- Export werkt zonder server-side PDF engine.

## Epic 3: Multi-group en tegen-elkaar planning

### Story E3-S1: Activity capacities voor multi-group
Als planner wil ik per activiteit min/max groepen instellen.

Acceptance criteria:
- `capacityGroupsMin` en `capacityGroupsMax` zijn configureerbaar per activiteit.
- Bij `multiGroupEnabled=false` geldt default 1/1.
- Validator gebruikt deze grenzen voor `capacity_mismatch`.

### Story E3-S2: Generator mode B (matches en tuples)
Als planner wil ik automatisch paringen krijgen met zo min mogelijk herhalingen.

Acceptance criteria:
- Generator kiest groepcombinaties op laagste matchup count.
- Generator respecteert hard constraints eerst.
- Bij vastlopen gebruikt generator beperkte backtracking (1-2 stappen).
- Als herhaling nodig is, wordt dit als soft violation gelogd.

### Story E3-S3: Resource-aware allocations
Als planner wil ik in hetzelfde timeslot meerdere matches op verschillende velden kunnen plannen.

Acceptance criteria:
- Allocation ondersteunt `resourceId`.
- Zelfde activity kan meerdere allocations in hetzelfde timeslot hebben op verschillende resources.
- Validator voorkomt resource dubbelboeking in hetzelfde timeslot.
- UI toont resource label (bijv. veld 1/2/3).

### Story E3-S4: Match rendering in UI
Als gebruiker wil ik direct zien wie tegen wie speelt.

Acceptance criteria:
- 2 groepen renderen als `A vs B`.
- 3+ groepen renderen als multi-chip layout met label `multi`.
- Groepen-rotatie view toont per groep ook tegenstandercontext.

## Epic 4: Prioriteit 2 (na MVP)

### Story E4-S1: Matchup history visualisatie
Acceptance criteria:
- Per groep overzicht van gespeelde tegenstanders met counts.
- Filter op activiteit en periode/timeslot bereik.

### Story E4-S2: Live timer run mode
Acceptance criteria:
- Start/stop timer per timeslot.
- UI markeert current/next slot.
- Run mode is read-only op plan data.

### Story E4-S3: Undo/redo stack
Acceptance criteria:
- Command stack met inverse operations.
- Undo en redo bewaren validatiecontext.
- Minimaal 50 stappen beschikbaar in sessie.

## Epic 5: Sync tussen devices

### Story E5-S1: Storage interface + local-first implementatie
Acceptance criteria:
- Uniforme storage interface (`savePlan`, `loadPlan`, `listPlans`, etc.).
- IndexedDB implementatie is default.
- Export/import JSON blijft beschikbaar als fallback.

### Story E5-S2: Cloud adapter
Acceptance criteria:
- Cloud implementatie kan zonder core refactor worden toegevoegd.
- Same-account open-on-other-device flow werkt.
- Conflicthantering minimaal met last-write-wins + waarschuwing.
