import type { PgClient } from "@storage";

export interface TeamMemberRow {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  is18Plus: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_18_plus: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(r: DbRow): TeamMemberRow {
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    is18Plus: r.is_18_plus,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function newId(): string {
  return `tm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateTeamMemberInput {
  orgId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  is18Plus?: boolean;
  notes?: string | null;
}

export interface UpdateTeamMemberPatch {
  name?: string;
  email?: string | null;
  phone?: string | null;
  is18Plus?: boolean;
  notes?: string | null;
}

export async function createTeamMember(
  client: PgClient,
  schema: string,
  input: CreateTeamMemberInput
): Promise<TeamMemberRow> {
  const id = newId();
  const result = await client.query<DbRow>(
    `INSERT INTO ${schema}.team_members (id, org_id, name, email, phone, is_18_plus, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, org_id, name, email, phone, is_18_plus, notes, created_at, updated_at;`,
    [
      id,
      input.orgId,
      input.name.trim(),
      input.email?.trim() || null,
      input.phone?.trim() || null,
      input.is18Plus ?? false,
      input.notes?.trim() || null,
    ]
  );
  return mapRow(result.rows[0]);
}

export async function updateTeamMember(
  client: PgClient,
  schema: string,
  id: string,
  orgId: string,
  patch: UpdateTeamMemberPatch
): Promise<TeamMemberRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(patch.name.trim());
  }
  if (patch.email !== undefined) {
    fields.push(`email = $${i++}`);
    values.push(patch.email?.trim() || null);
  }
  if (patch.phone !== undefined) {
    fields.push(`phone = $${i++}`);
    values.push(patch.phone?.trim() || null);
  }
  if (patch.is18Plus !== undefined) {
    fields.push(`is_18_plus = $${i++}`);
    values.push(patch.is18Plus);
  }
  if (patch.notes !== undefined) {
    fields.push(`notes = $${i++}`);
    values.push(patch.notes?.trim() || null);
  }

  if (fields.length === 0) {
    return getTeamMember(client, schema, id, orgId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id, orgId);

  const result = await client.query<DbRow>(
    `UPDATE ${schema}.team_members
     SET ${fields.join(", ")}
     WHERE id = $${i++} AND org_id = $${i}
     RETURNING id, org_id, name, email, phone, is_18_plus, notes, created_at, updated_at;`,
    values
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteTeamMember(
  client: PgClient,
  schema: string,
  id: string,
  orgId: string
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `DELETE FROM ${schema}.team_members WHERE id = $1 AND org_id = $2 RETURNING id;`,
    [id, orgId]
  );
  return result.rows.length > 0;
}

export async function getTeamMember(
  client: PgClient,
  schema: string,
  id: string,
  orgId: string
): Promise<TeamMemberRow | null> {
  const result = await client.query<DbRow>(
    `SELECT id, org_id, name, email, phone, is_18_plus, notes, created_at, updated_at
     FROM ${schema}.team_members WHERE id = $1 AND org_id = $2;`,
    [id, orgId]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listTeamMembersForOrg(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<TeamMemberRow[]> {
  const result = await client.query<DbRow>(
    `SELECT id, org_id, name, email, phone, is_18_plus, notes, created_at, updated_at
     FROM ${schema}.team_members WHERE org_id = $1 ORDER BY name ASC;`,
    [orgId]
  );
  return result.rows.map(mapRow);
}

// ── Group memberships ────────────────────────────────────────────────

export interface GroupMembership {
  memberId: string;
  configId: string;
  groupId: string;
}

export async function listMembershipsForConfig(
  client: PgClient,
  schema: string,
  configId: string
): Promise<GroupMembership[]> {
  const result = await client.query<{ member_id: string; config_id: string; group_id: string }>(
    `SELECT member_id, config_id, group_id FROM ${schema}.group_memberships WHERE config_id = $1;`,
    [configId]
  );
  return result.rows.map((r) => ({
    memberId: r.member_id,
    configId: r.config_id,
    groupId: r.group_id,
  }));
}

export async function listMembersForGroup(
  client: PgClient,
  schema: string,
  configId: string,
  groupId: string
): Promise<TeamMemberRow[]> {
  const result = await client.query<DbRow>(
    `SELECT tm.id, tm.org_id, tm.name, tm.email, tm.phone, tm.is_18_plus, tm.notes, tm.created_at, tm.updated_at
     FROM ${schema}.team_members tm
     JOIN ${schema}.group_memberships gm ON gm.member_id = tm.id
     WHERE gm.config_id = $1 AND gm.group_id = $2
     ORDER BY tm.name ASC;`,
    [configId, groupId]
  );
  return result.rows.map(mapRow);
}

/**
 * Replace the set of members assigned to a group (config_id, group_id) with the given memberIds.
 * Members not in the list are unassigned from this group only (still in org address book).
 */
export async function setGroupMembers(
  client: PgClient,
  schema: string,
  configId: string,
  groupId: string,
  memberIds: string[]
): Promise<void> {
  await client.query(
    `DELETE FROM ${schema}.group_memberships WHERE config_id = $1 AND group_id = $2;`,
    [configId, groupId]
  );
  if (memberIds.length === 0) return;
  const valuesSql = memberIds.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
  const params = memberIds.flatMap((mid) => [mid, configId, groupId]);
  await client.query(
    `INSERT INTO ${schema}.group_memberships (member_id, config_id, group_id) VALUES ${valuesSql}
     ON CONFLICT (member_id, config_id, group_id) DO NOTHING;`,
    params
  );
}
