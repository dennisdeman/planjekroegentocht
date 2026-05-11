import type { PgClient } from "@storage";
import { SPEL_REGISTRY, type MaterialItem, type SpelExplanation } from "@core";

export interface OrgSpelRow {
  id: string;
  orgId: string;
  baseKey: string | null;
  name: string;
  materials: MaterialItem[];
  explanation: SpelExplanation;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: string;
  org_id: string;
  base_key: string | null;
  name: string;
  materials: MaterialItem[];
  explanation: SpelExplanation;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toRow(r: DbRow): OrgSpelRow {
  return {
    id: r.id,
    orgId: r.org_id,
    baseKey: r.base_key,
    name: r.name,
    materials: r.materials ?? [],
    explanation: r.explanation ?? {},
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const EMPTY_EXPLANATION: SpelExplanation = {
  summary: "",
  rules: "",
  fieldSetup: "",
  playersPerTeam: "",
  duration: "",
};

export async function listOrgSpellen(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<OrgSpelRow[]> {
  const result = await client.query<DbRow>(
    `SELECT * FROM ${schema}.organization_spellen WHERE org_id = $1 ORDER BY name;`,
    [orgId]
  );
  return result.rows.map(toRow);
}

export async function findOrgSpel(
  client: PgClient,
  schema: string,
  id: string,
  orgId: string
): Promise<OrgSpelRow | null> {
  const result = await client.query<DbRow>(
    `SELECT * FROM ${schema}.organization_spellen WHERE id = $1 AND org_id = $2;`,
    [id, orgId]
  );
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function initOrgSpellenFromRegistry(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<number> {
  const existing = await client.query<{ base_key: string }>(
    `SELECT base_key FROM ${schema}.organization_spellen WHERE org_id = $1 AND base_key IS NOT NULL;`,
    [orgId]
  );
  const existingKeys = new Set(existing.rows.map((r) => r.base_key));

  let added = 0;
  for (const spel of SPEL_REGISTRY) {
    if (existingKeys.has(spel.key)) continue;
    const id = `ospel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await client.query(
      `INSERT INTO ${schema}.organization_spellen (id, org_id, base_key, name, materials, explanation)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb);`,
      [id, orgId, spel.key, spel.name, JSON.stringify(spel.materials), JSON.stringify(spel.explanation)]
    );
    added++;
  }
  return added;
}

export async function createOrgSpel(
  client: PgClient,
  schema: string,
  orgId: string,
  input: { name: string; materials?: MaterialItem[]; explanation?: Partial<SpelExplanation> }
): Promise<OrgSpelRow> {
  const id = `ospel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await client.query<DbRow>(
    `INSERT INTO ${schema}.organization_spellen (id, org_id, base_key, name, materials, explanation)
     VALUES ($1, $2, NULL, $3, $4::jsonb, $5::jsonb)
     RETURNING *;`,
    [id, orgId, input.name, JSON.stringify(input.materials ?? []), JSON.stringify({ ...EMPTY_EXPLANATION, ...(input.explanation ?? {}) })]
  );
  return toRow(result.rows[0]);
}

export async function updateOrgSpel(
  client: PgClient,
  schema: string,
  id: string,
  orgId: string,
  input: { name?: string; materials?: MaterialItem[]; explanation?: SpelExplanation; isActive?: boolean }
): Promise<OrgSpelRow | null> {
  const fields: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [id, orgId];
  let i = 3;
  if (input.name !== undefined) { fields.push(`name = $${i++}`); values.push(input.name); }
  if (input.materials !== undefined) { fields.push(`materials = $${i++}::jsonb`); values.push(JSON.stringify(input.materials)); }
  if (input.explanation !== undefined) { fields.push(`explanation = $${i++}::jsonb`); values.push(JSON.stringify(input.explanation)); }
  if (input.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(input.isActive); }

  const result = await client.query<DbRow>(
    `UPDATE ${schema}.organization_spellen SET ${fields.join(", ")} WHERE id = $1 AND org_id = $2 RETURNING *;`,
    values
  );
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function resetOrgSpelToDefault(
  client: PgClient,
  schema: string,
  id: string,
  orgId: string
): Promise<OrgSpelRow | null> {
  const spel = await findOrgSpel(client, schema, id, orgId);
  if (!spel || !spel.baseKey) return null;
  const def = SPEL_REGISTRY.find((s) => s.key === spel.baseKey);
  if (!def) return null;
  return updateOrgSpel(client, schema, id, orgId, {
    name: def.name,
    materials: def.materials,
    explanation: def.explanation,
  });
}

export async function deleteOrgSpel(
  client: PgClient,
  schema: string,
  id: string,
  orgId: string
): Promise<void> {
  await client.query(
    `DELETE FROM ${schema}.organization_spellen WHERE id = $1 AND org_id = $2;`,
    [id, orgId]
  );
}
