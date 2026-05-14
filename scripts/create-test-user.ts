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

const email = (args.email as string) ?? "dennis@planjekroegentocht.test";
const password = (args.password as string) ?? "kroegen123";
const name = (args.name as string) ?? "Dennis";
const orgName = (args.org as string) ?? "Test Organisatie";

const { getClient, getSchema, ensureMigrations } = await import("../lib/server/postgres-storage");
const { createUser, createOrganization, findUserByEmail } = await import("../lib/server/db");

await ensureMigrations();
const client = getClient();
const schema = getSchema();

const existing = await findUserByEmail(client, schema, email);
if (existing) {
  console.log(`User ${email} already exists (id: ${existing.id}). Marking verified + making sure org exists.`);
  await client.query(
    `UPDATE ${schema}.users SET email_verified_at = NOW() WHERE id = $1 AND email_verified_at IS NULL;`,
    [existing.id]
  );
} else {
  const user = await createUser(client, schema, { email, name, password });
  await createOrganization(client, schema, { name: orgName, createdByUserId: user.id });
  await client.query(`UPDATE ${schema}.users SET email_verified_at = NOW() WHERE id = $1;`, [user.id]);
  console.log(`Created user ${user.id} + org "${orgName}"`);
}

console.log("─────────────────────────────────────────────");
console.log(`Email:    ${email}`);
console.log(`Password: ${password}`);
console.log(`Org:      ${orgName}`);
console.log("─────────────────────────────────────────────");
console.log("Log in op http://localhost:3040/login");
process.exit(0);
