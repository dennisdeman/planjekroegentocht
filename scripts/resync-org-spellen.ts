/**
 * Opruim-script: verwijdert org_spellen die niet meer in de huidige SPEL_REGISTRY zitten
 * en seedt de nieuwe drankspellen. Veilig idempotent.
 *
 * Gebruik:
 *   npx tsx scripts/resync-org-spellen.ts                 # alle orgs
 *   npx tsx scripts/resync-org-spellen.ts orgId=<id>      # specifieke org
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const env = readFileSync(envPath, "utf8");
for (const line of env.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx);
  const value = trimmed.slice(idx + 1);
  if (!(key in process.env)) process.env[key] = value;
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const eq = a.indexOf("=");
    return eq === -1 ? [a.replace(/^-+/, ""), "true"] : [a.slice(0, eq).replace(/^-+/, ""), a.slice(eq + 1)];
  })
);

const { getClient, getSchema, ensureMigrations } = await import("../lib/server/postgres-storage");
const { SPEL_REGISTRY } = await import("../packages/core/src/spel-registry");
const { initOrgSpellenFromRegistry } = await import("../lib/server/org-spellen-db");

await ensureMigrations();
const client = getClient();
const schema = getSchema();

const validKeys = new Set(SPEL_REGISTRY.map((s) => s.key));
console.log(`Current registry has ${validKeys.size} spellen:`, Array.from(validKeys).join(", "));

const orgFilter = args.orgId
  ? { sql: `WHERE id = $1`, params: [args.orgId as string] }
  : { sql: ``, params: [] };

const orgs = await client.query<{ id: string; name: string }>(
  `SELECT id, name FROM ${schema}.organizations ${orgFilter.sql};`,
  orgFilter.params
);

for (const org of orgs.rows) {
  console.log(`\n--- Org: ${org.name} (${org.id}) ---`);

  // 1. Lijst bestaande spellen met base_keys die niet meer in de registry zitten
  const stale = await client.query<{ id: string; name: string; base_key: string | null }>(
    `SELECT id, name, base_key FROM ${schema}.organization_spellen
     WHERE org_id = $1 AND base_key IS NOT NULL AND base_key <> ALL($2);`,
    [org.id, Array.from(validKeys)]
  );
  console.log(`  Stale spellen (te verwijderen): ${stale.rows.length}`);
  for (const s of stale.rows) {
    console.log(`    - ${s.name} (${s.base_key})`);
  }

  // 2. Verwijder stale spellen (FK cascades naar stations die ernaar refereren? — bewust handmatig)
  if (stale.rows.length > 0) {
    const staleIds = stale.rows.map((r) => r.id);
    await client.query(
      `DELETE FROM ${schema}.organization_spellen WHERE id = ANY($1);`,
      [staleIds]
    );
    console.log(`  ✓ ${stale.rows.length} stale spellen verwijderd`);
  }

  // 3. Seed nieuwe drankspellen
  const added = await initOrgSpellenFromRegistry(client, schema, org.id);
  console.log(`  ✓ ${added} nieuwe drankspellen toegevoegd`);
}

console.log("\nKlaar.");
process.exit(0);
