# Storage Architecture

## Kort antwoord
Ja: cloud-opslag kan in Postgres.  
Aanpak: **local-first** (IndexedDB) + **Postgres adapter** via een gedeelde storage interface.

## Waarom deze opzet
- Snelle UX en offline-veilig: writes direct lokaal.
- Multi-device mogelijk: sync naar Postgres via API.
- Vendor lock-in laag: core gebruikt alleen `PlannerStorage`, niet direct een databaseclient.

## Implementatie in deze repo
- Interface: `packages/storage/src/types.ts`
- Local adapter (MVP): `packages/storage/src/indexeddb-storage.ts`
- Test/Node adapter: `packages/storage/src/in-memory-storage.ts`
- Cloud adapter (Postgres): `packages/storage/src/postgres-storage.ts`
- Autosave/recover helper: `packages/storage/src/autosave.ts`

## Sync-strategie (fase 1)
- `savePlan/saveConfig` lokaal direct.
- Achtergrond-sync naar Postgres.
- Conflict policy: last-write-wins + waarschuwing in UI.

## Sync-strategie (fase 2)
- Merge op command/changelog niveau i.p.v. hele snapshot.
- Per plan lock of optimistic concurrency (`updated_at` of version token).
