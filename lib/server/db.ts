/**
 * Low-level database helpers for users, organizations, memberships and invitations.
 */
import type { PgClient } from "@storage";
import { randomUUID } from "node:crypto";
import { hash, compare } from "bcryptjs";

// ── Types ──────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  email_verified_at: string | null;
  is_superadmin: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbEmailVerificationToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface DbOrganization {
  id: string;
  name: string;
  slug: string;
  active_plan: string;
  trial_expires_at: string | null;
  plan_expires_at: string | null;
  plan_frozen: boolean;
  logo_data: string | null;
  billing_type: string;
  billing_company_name: string | null;
  billing_address: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_vat_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMembership {
  id: string;
  user_id: string;
  org_id: string;
  role: "admin" | "member";
  created_at: string;
}

export interface DbInvitation {
  id: string;
  org_id: string;
  email: string;
  role: "admin" | "member";
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(client: PgClient, base: string, schema: string): Promise<string> {
  let slug = slugify(base);
  if (!slug) slug = "org";
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const result = await client.query<{ id: string }>(
      `SELECT id FROM ${schema}.organizations WHERE slug = $1 LIMIT 1;`,
      [candidate]
    );
    if (result.rows.length === 0) return candidate;
    attempt++;
  }
}

// ── Users ──────────────────────────────────────────────────────────────

export async function createUser(
  client: PgClient,
  schema: string,
  data: { email: string; name: string; password: string }
): Promise<DbUser> {
  const id = randomUUID();
  const passwordHash = await hash(data.password, 12);
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO ${schema}.users (id, email, name, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5);`,
    [id, data.email.toLowerCase().trim(), data.name.trim(), passwordHash, now]
  );
  return {
    id,
    email: data.email.toLowerCase().trim(),
    name: data.name.trim(),
    password_hash: passwordHash,
    email_verified_at: null,
    is_superadmin: false,
    created_at: now,
    updated_at: now,
  };
}

export async function findUserByEmail(
  client: PgClient,
  schema: string,
  email: string
): Promise<DbUser | null> {
  const result = await client.query<DbUser>(
    `SELECT id, email, name, password_hash, email_verified_at, is_superadmin, created_at, updated_at
     FROM ${schema}.users WHERE email = $1;`,
    [email.toLowerCase().trim()]
  );
  return result.rows[0] ?? null;
}

export async function findUserById(
  client: PgClient,
  schema: string,
  userId: string
): Promise<DbUser | null> {
  const result = await client.query<DbUser>(
    `SELECT id, email, name, password_hash, email_verified_at, is_superadmin, created_at, updated_at
     FROM ${schema}.users WHERE id = $1;`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
  return compare(plaintext, passwordHash);
}

export async function updateUserName(
  client: PgClient,
  schema: string,
  userId: string,
  name: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.users SET name = $1, updated_at = NOW() WHERE id = $2;`,
    [name.trim(), userId]
  );
}

export async function changeUserPassword(
  client: PgClient,
  schema: string,
  userId: string,
  newPassword: string
): Promise<void> {
  const passwordHash = await hash(newPassword, 12);
  await client.query(
    `UPDATE ${schema}.users SET password_hash = $1, updated_at = NOW() WHERE id = $2;`,
    [passwordHash, userId]
  );
}

// ── Organizations ──────────────────────────────────────────────────────

export async function createOrganization(
  client: PgClient,
  schema: string,
  data: { name: string; createdByUserId: string }
): Promise<{ org: DbOrganization; membership: DbMembership }> {
  const orgId = randomUUID();
  const slug = await uniqueSlug(client, data.name, schema);
  const now = new Date().toISOString();
  const trialExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await client.query(
    `INSERT INTO ${schema}.organizations (id, name, slug, active_plan, trial_expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'free', $4, $5, $5);`,
    [orgId, data.name.trim(), slug, trialExpires, now]
  );

  const membership = await createMembership(client, schema, {
    userId: data.createdByUserId,
    orgId,
    role: "admin",
  });

  return {
    org: {
      id: orgId, name: data.name.trim(), slug,
      active_plan: "free", trial_expires_at: trialExpires, plan_expires_at: null, plan_frozen: false, logo_data: null,
      billing_type: "private", billing_company_name: null, billing_address: null,
      billing_postal_code: null, billing_city: null, billing_vat_number: null,
      created_at: now, updated_at: now,
    },
    membership,
  };
}

export async function findOrganizationById(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<DbOrganization | null> {
  const result = await client.query<DbOrganization>(
    `SELECT * FROM ${schema}.organizations WHERE id = $1;`,
    [orgId]
  );
  return result.rows[0] ?? null;
}

// ── Memberships ────────────────────────────────────────────────────────

export async function createMembership(
  client: PgClient,
  schema: string,
  data: { userId: string; orgId: string; role: "admin" | "member" }
): Promise<DbMembership> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO ${schema}.memberships (id, user_id, org_id, role, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, org_id) DO NOTHING;`,
    [id, data.userId, data.orgId, data.role, now]
  );
  return { id, user_id: data.userId, org_id: data.orgId, role: data.role, created_at: now };
}

export async function listMembershipsForUser(
  client: PgClient,
  schema: string,
  userId: string
): Promise<Array<DbMembership & { org_name: string; org_slug: string }>> {
  const result = await client.query<DbMembership & { org_name: string; org_slug: string }>(
    `SELECT m.id, m.user_id, m.org_id, m.role, m.created_at,
            o.name AS org_name, o.slug AS org_slug
     FROM ${schema}.memberships m
     JOIN ${schema}.organizations o ON o.id = m.org_id
     WHERE m.user_id = $1
     ORDER BY o.name;`,
    [userId]
  );
  return result.rows;
}

export async function getMembership(
  client: PgClient,
  schema: string,
  userId: string,
  orgId: string
): Promise<DbMembership | null> {
  const result = await client.query<DbMembership>(
    `SELECT id, user_id, org_id, role, created_at
     FROM ${schema}.memberships
     WHERE user_id = $1 AND org_id = $2;`,
    [userId, orgId]
  );
  return result.rows[0] ?? null;
}

export async function listMembersOfOrg(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<Array<DbMembership & { user_name: string; user_email: string }>> {
  const result = await client.query<DbMembership & { user_name: string; user_email: string }>(
    `SELECT m.id, m.user_id, m.org_id, m.role, m.created_at,
            u.name AS user_name, u.email AS user_email
     FROM ${schema}.memberships m
     JOIN ${schema}.users u ON u.id = m.user_id
     WHERE m.org_id = $1
     ORDER BY u.name;`,
    [orgId]
  );
  return result.rows;
}

export async function deleteMembership(
  client: PgClient,
  schema: string,
  membershipId: string
): Promise<void> {
  await client.query(`DELETE FROM ${schema}.memberships WHERE id = $1;`, [membershipId]);
}

// ── Invitations ────────────────────────────────────────────────────────

export async function createInvitation(
  client: PgClient,
  schema: string,
  data: { orgId: string; email: string; role: "admin" | "member"; invitedBy: string }
): Promise<DbInvitation> {
  const id = randomUUID();
  const token = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await client.query(
    `INSERT INTO ${schema}.invitations (id, org_id, email, role, invited_by, token, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
    [id, data.orgId, data.email.toLowerCase().trim(), data.role, data.invitedBy, token, expiresAt, now]
  );

  return {
    id,
    org_id: data.orgId,
    email: data.email.toLowerCase().trim(),
    role: data.role,
    invited_by: data.invitedBy,
    token,
    expires_at: expiresAt,
    accepted_at: null,
    created_at: now,
  };
}

export async function findInvitationByToken(
  client: PgClient,
  schema: string,
  token: string
): Promise<(DbInvitation & { org_name: string }) | null> {
  const result = await client.query<DbInvitation & { org_name: string }>(
    `SELECT i.*, o.name AS org_name
     FROM ${schema}.invitations i
     JOIN ${schema}.organizations o ON o.id = i.org_id
     WHERE i.token = $1 AND i.accepted_at IS NULL AND i.expires_at > NOW();`,
    [token]
  );
  return result.rows[0] ?? null;
}

export async function acceptInvitation(
  client: PgClient,
  schema: string,
  invitationId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.invitations SET accepted_at = NOW() WHERE id = $1;`,
    [invitationId]
  );
}

export async function listInvitationsForOrg(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<DbInvitation[]> {
  const result = await client.query<DbInvitation>(
    `SELECT * FROM ${schema}.invitations
     WHERE org_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC;`,
    [orgId]
  );
  return result.rows;
}

// ── Email verification ─────────────────────────────────────────────────

export async function createEmailVerificationToken(
  client: PgClient,
  schema: string,
  userId: string
): Promise<DbEmailVerificationToken> {
  const id = randomUUID();
  const token = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  await client.query(
    `INSERT INTO ${schema}.email_verification_tokens (id, user_id, token, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5);`,
    [id, userId, token, expiresAt, now]
  );

  return { id, user_id: userId, token, expires_at: expiresAt, used_at: null, created_at: now };
}

export async function findValidVerificationToken(
  client: PgClient,
  schema: string,
  token: string
): Promise<DbEmailVerificationToken | null> {
  const result = await client.query<DbEmailVerificationToken>(
    `SELECT * FROM ${schema}.email_verification_tokens
     WHERE token = $1 AND used_at IS NULL AND expires_at > NOW();`,
    [token]
  );
  return result.rows[0] ?? null;
}

export async function markEmailVerified(
  client: PgClient,
  schema: string,
  userId: string,
  tokenId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1;`,
    [userId]
  );
  await client.query(
    `UPDATE ${schema}.email_verification_tokens SET used_at = NOW() WHERE id = $1;`,
    [tokenId]
  );
}

export async function markEmailVerifiedByUserId(
  client: PgClient,
  schema: string,
  userId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1;`,
    [userId]
  );
}

// ── Password reset ─────────────────────────────────────────────────────

export interface DbPasswordResetToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export async function createPasswordResetToken(
  client: PgClient,
  schema: string,
  userId: string
): Promise<DbPasswordResetToken> {
  const id = randomUUID();
  const token = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  await client.query(
    `INSERT INTO ${schema}.password_reset_tokens (id, user_id, token, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5);`,
    [id, userId, token, expiresAt, now]
  );

  return { id, user_id: userId, token, expires_at: expiresAt, used_at: null, created_at: now };
}

export async function findValidPasswordResetToken(
  client: PgClient,
  schema: string,
  token: string
): Promise<DbPasswordResetToken | null> {
  const result = await client.query<DbPasswordResetToken>(
    `SELECT * FROM ${schema}.password_reset_tokens
     WHERE token = $1 AND used_at IS NULL AND expires_at > NOW();`,
    [token]
  );
  return result.rows[0] ?? null;
}

export async function resetPassword(
  client: PgClient,
  schema: string,
  userId: string,
  tokenId: string,
  newPassword: string
): Promise<void> {
  const passwordHash = await hash(newPassword, 12);
  await client.query(
    `UPDATE ${schema}.users SET password_hash = $1, updated_at = NOW() WHERE id = $2;`,
    [passwordHash, userId]
  );
  await client.query(
    `UPDATE ${schema}.password_reset_tokens SET used_at = NOW() WHERE id = $1;`,
    [tokenId]
  );
}

// ── Config templates (sjablonen) ────────────────────────────────────────

export interface DbConfigTemplate {
  id: string;
  org_id: string;
  name: string;
  payload: unknown;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function createConfigTemplate(
  client: PgClient,
  schema: string,
  data: { orgId: string; name: string; payload: unknown; createdBy: string }
): Promise<DbConfigTemplate> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO ${schema}.config_templates (id, org_id, name, payload, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6);`,
    [id, data.orgId, data.name.trim(), JSON.stringify(data.payload), data.createdBy, now]
  );
  return {
    id,
    org_id: data.orgId,
    name: data.name.trim(),
    payload: data.payload,
    created_by: data.createdBy,
    created_at: now,
    updated_at: now,
  };
}

export async function listConfigTemplates(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<DbConfigTemplate[]> {
  const result = await client.query<DbConfigTemplate>(
    `SELECT id, org_id, name, payload, created_by, created_at, updated_at
     FROM ${schema}.config_templates
     WHERE org_id = $1
     ORDER BY updated_at DESC;`,
    [orgId]
  );
  return result.rows;
}

export async function deleteConfigTemplate(
  client: PgClient,
  schema: string,
  templateId: string,
  orgId: string
): Promise<void> {
  await client.query(
    `DELETE FROM ${schema}.config_templates WHERE id = $1 AND org_id = $2;`,
    [templateId, orgId]
  );
}

// ── Payments ──────────────────────────────────────────────────────────

export interface DbPayment {
  id: string;
  org_id: string;
  plan: string;
  amount_cents: number;
  status: string;
  provider_ref: string | null;
  coupon_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export async function createPaymentWithId(
  client: PgClient,
  schema: string,
  data: { id: string; orgId: string; plan: string; amountCents: number; providerRef: string; description: string; couponId?: string | null }
): Promise<DbPayment> {
  const id = data.id;
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO ${schema}.payments (id, org_id, plan, amount_cents, status, provider_ref, coupon_id, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $8);`,
    [id, data.orgId, data.plan, data.amountCents, data.providerRef, data.couponId ?? null, data.description, now]
  );
  return {
    id, org_id: data.orgId, plan: data.plan, amount_cents: data.amountCents,
    status: "pending", provider_ref: data.providerRef, coupon_id: data.couponId ?? null,
    description: data.description, created_at: now, updated_at: now,
  };
}

export async function findPaymentByProviderRef(
  client: PgClient,
  schema: string,
  providerRef: string
): Promise<DbPayment | null> {
  const result = await client.query<DbPayment>(
    `SELECT * FROM ${schema}.payments WHERE provider_ref = $1 LIMIT 1;`,
    [providerRef]
  );
  return result.rows[0] ?? null;
}

export async function findPaymentById(
  client: PgClient,
  schema: string,
  paymentId: string
): Promise<DbPayment | null> {
  const result = await client.query<DbPayment>(
    `SELECT * FROM ${schema}.payments WHERE id = $1 LIMIT 1;`,
    [paymentId]
  );
  return result.rows[0] ?? null;
}

export async function updatePaymentStatus(
  client: PgClient,
  schema: string,
  providerRef: string,
  status: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.payments SET status = $1, updated_at = NOW() WHERE provider_ref = $2;`,
    [status, providerRef]
  );
}

export async function activateOrgPlan(
  client: PgClient,
  schema: string,
  orgId: string,
  plan: "pro_event" | "pro_year",
  days: number
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  await client.query(
    `UPDATE ${schema}.organizations
     SET active_plan = $1, plan_expires_at = $2, plan_frozen = FALSE, updated_at = NOW()
     WHERE id = $3;`,
    [plan, expiresAt.toISOString(), orgId]
  );
}

// ── Superadmin ────────────────────────────────────────────────────────

export async function isSuperadmin(
  client: PgClient,
  schema: string,
  userId: string
): Promise<boolean> {
  const result = await client.query<{ is_superadmin: boolean }>(
    `SELECT is_superadmin FROM ${schema}.users WHERE id = $1;`,
    [userId]
  );
  return result.rows[0]?.is_superadmin === true;
}

// ── Admin: users ──────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  email_verified_at: string | null;
  is_superadmin: boolean;
  created_at: string;
  org_count: number;
  config_count: number;
}

export async function adminListUsers(
  client: PgClient,
  schema: string,
  opts: { search?: string; limit?: number; offset?: number } = {}
): Promise<{ users: AdminUserRow[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const where = opts.search
    ? `WHERE u.email ILIKE $1 OR u.name ILIKE $1`
    : "";
  const params: unknown[] = opts.search ? [`%${opts.search}%`] : [];

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${schema}.users u ${where};`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const dataParams = [...params, limit, offset];
  const result = await client.query<AdminUserRow>(
    `SELECT u.id, u.email, u.name, u.email_verified_at, u.is_superadmin, u.created_at,
            COALESCE(mc.org_count, 0)::int AS org_count,
            COALESCE(cc.config_count, 0)::int AS config_count
     FROM ${schema}.users u
     LEFT JOIN (
       SELECT user_id, COUNT(*) AS org_count FROM ${schema}.memberships GROUP BY user_id
     ) mc ON mc.user_id = u.id
     LEFT JOIN (
       SELECT p.org_id, COUNT(*) AS config_count FROM ${schema}.planner_configs p
       WHERE p.org_id IS NOT NULL GROUP BY p.org_id
     ) cc ON cc.org_id IN (
       SELECT org_id FROM ${schema}.memberships WHERE user_id = u.id
     )
     ${where}
     ORDER BY u.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2};`,
    dataParams
  );

  return { users: result.rows, total };
}

export async function adminGetUserDetail(
  client: PgClient,
  schema: string,
  userId: string
): Promise<{
  user: DbUser;
  memberships: Array<DbMembership & { org_name: string; org_slug: string }>;
} | null> {
  const user = await findUserById(client, schema, userId);
  if (!user) return null;
  const memberships = await listMembershipsForUser(client, schema, userId);
  return { user, memberships };
}

export async function adminVerifyUserEmail(
  client: PgClient,
  schema: string,
  userId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1;`,
    [userId]
  );
}

export async function adminResetUserPassword(
  client: PgClient,
  schema: string,
  userId: string,
  newPassword: string
): Promise<void> {
  const passwordHash = await hash(newPassword, 12);
  await client.query(
    `UPDATE ${schema}.users SET password_hash = $1, updated_at = NOW() WHERE id = $2;`,
    [passwordHash, userId]
  );
}

export async function adminDeleteUser(
  client: PgClient,
  schema: string,
  userId: string
): Promise<void> {
  await client.query(`DELETE FROM ${schema}.users WHERE id = $1;`, [userId]);
}

// ── Admin: organizations ──────────────────────────────────────────────

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  active_plan: string;
  plan_expires_at: string | null;
  trial_expires_at: string | null;
  plan_frozen: boolean;
  created_at: string;
  member_count: number;
  config_count: number;
  plan_count: number;
}

export async function adminListOrgs(
  client: PgClient,
  schema: string,
  opts: { search?: string; limit?: number; offset?: number } = {}
): Promise<{ orgs: AdminOrgRow[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const where = opts.search
    ? `WHERE o.name ILIKE $1 OR o.slug ILIKE $1`
    : "";
  const params: unknown[] = opts.search ? [`%${opts.search}%`] : [];

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${schema}.organizations o ${where};`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const dataParams = [...params, limit, offset];
  const result = await client.query<AdminOrgRow>(
    `SELECT o.id, o.name, o.slug, o.active_plan, o.plan_expires_at, o.trial_expires_at, o.plan_frozen, o.created_at,
            COALESCE(mc.member_count, 0)::int AS member_count,
            COALESCE(cc.config_count, 0)::int AS config_count,
            COALESCE(pc.plan_count, 0)::int AS plan_count
     FROM ${schema}.organizations o
     LEFT JOIN (SELECT org_id, COUNT(*) AS member_count FROM ${schema}.memberships GROUP BY org_id) mc ON mc.org_id = o.id
     LEFT JOIN (SELECT org_id, COUNT(*) AS config_count FROM ${schema}.planner_configs WHERE org_id IS NOT NULL GROUP BY org_id) cc ON cc.org_id = o.id
     LEFT JOIN (SELECT org_id, COUNT(*) AS plan_count FROM ${schema}.planner_plans WHERE org_id IS NOT NULL GROUP BY org_id) pc ON pc.org_id = o.id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2};`,
    dataParams
  );

  return { orgs: result.rows, total };
}

export async function adminGetOrgDetail(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<{
  org: DbOrganization;
  members: Array<DbMembership & { user_name: string; user_email: string }>;
  configCount: number;
  planCount: number;
} | null> {
  const org = await findOrganizationById(client, schema, orgId);
  if (!org) return null;
  const members = await listMembersOfOrg(client, schema, orgId);
  const ccResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${schema}.planner_configs WHERE org_id = $1;`,
    [orgId]
  );
  const pcResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${schema}.planner_plans WHERE org_id = $1;`,
    [orgId]
  );
  return {
    org,
    members,
    configCount: parseInt(ccResult.rows[0]?.count ?? "0", 10),
    planCount: parseInt(pcResult.rows[0]?.count ?? "0", 10),
  };
}

export async function adminUpdateOrgName(
  client: PgClient,
  schema: string,
  orgId: string,
  name: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.organizations SET name = $1, updated_at = NOW() WHERE id = $2;`,
    [name.trim(), orgId]
  );
}

export async function adminDeleteOrg(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<void> {
  await client.query(`DELETE FROM ${schema}.organizations WHERE id = $1;`, [orgId]);
}

// ── Admin: dashboard stats ────────────────────────────────────────────

export interface AdminDashboardStats {
  totalUsers: number;
  totalOrgs: number;
  totalConfigs: number;
  totalPlans: number;
  planDistribution: { free: number; pro_event: number; pro_year: number };
  totalPayments: number;
  totalRevenueCents: number;
  recentUsers: Array<{ id: string; email: string; name: string; created_at: string }>;
  recentPayments: Array<{ id: string; org_name: string; plan: string; amount_cents: number; status: string; created_at: string }>;
  topOrgs: Array<{ id: string; name: string; member_count: number }>;
}

export async function adminGetDashboardStats(
  client: PgClient,
  schema: string
): Promise<AdminDashboardStats> {
  const [users, orgs, configs, plans, planDist, paymentStats] = await Promise.all([
    client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${schema}.users;`),
    client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${schema}.organizations;`),
    client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${schema}.planner_configs;`),
    client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${schema}.planner_plans;`),
    client.query<{ active_plan: string; count: string }>(
      `SELECT active_plan, COUNT(*)::text AS count FROM ${schema}.organizations GROUP BY active_plan;`
    ),
    client.query<{ total_payments: string; total_revenue: string }>(
      `SELECT COUNT(*)::text AS total_payments, COALESCE(SUM(amount_cents), 0)::text AS total_revenue
       FROM ${schema}.payments WHERE status = 'paid';`
    ),
  ]);

  const dist: { free: number; pro_event: number; pro_year: number } = { free: 0, pro_event: 0, pro_year: 0 };
  for (const row of planDist.rows) {
    if (row.active_plan in dist) {
      dist[row.active_plan as keyof typeof dist] = parseInt(row.count, 10);
    }
  }

  const recentResult = await client.query<{ id: string; email: string; name: string; created_at: string }>(
    `SELECT id, email, name, created_at FROM ${schema}.users ORDER BY created_at DESC LIMIT 10;`
  );

  const recentPaymentsResult = await client.query<{ id: string; org_name: string; plan: string; amount_cents: number; status: string; created_at: string }>(
    `SELECT p.id, o.name AS org_name, p.plan, p.amount_cents, p.status, p.created_at
     FROM ${schema}.payments p
     JOIN ${schema}.organizations o ON o.id = p.org_id
     ORDER BY p.created_at DESC LIMIT 10;`
  );

  const topOrgsResult = await client.query<{ id: string; name: string; member_count: number }>(
    `SELECT o.id, o.name, COUNT(m.id)::int AS member_count
     FROM ${schema}.organizations o
     LEFT JOIN ${schema}.memberships m ON m.org_id = o.id
     GROUP BY o.id, o.name
     ORDER BY member_count DESC
     LIMIT 10;`
  );

  return {
    totalUsers: parseInt(users.rows[0]?.count ?? "0", 10),
    totalOrgs: parseInt(orgs.rows[0]?.count ?? "0", 10),
    totalConfigs: parseInt(configs.rows[0]?.count ?? "0", 10),
    totalPlans: parseInt(plans.rows[0]?.count ?? "0", 10),
    planDistribution: dist,
    totalPayments: parseInt(paymentStats.rows[0]?.total_payments ?? "0", 10),
    totalRevenueCents: parseInt(paymentStats.rows[0]?.total_revenue ?? "0", 10),
    recentUsers: recentResult.rows,
    recentPayments: recentPaymentsResult.rows,
    topOrgs: topOrgsResult.rows,
  };
}

// ── Coupons ──────────────────────────────────────────────────────────

export interface DbCoupon {
  id: string;
  code: string;
  discount_cents: number;
  description: string | null;
  valid_for_plan: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export async function findCouponByCode(
  client: PgClient,
  schema: string,
  code: string
): Promise<DbCoupon | null> {
  const result = await client.query<DbCoupon>(
    `SELECT * FROM ${schema}.coupons WHERE UPPER(code) = UPPER($1) AND active = TRUE LIMIT 1;`,
    [code.trim()]
  );
  return result.rows[0] ?? null;
}

/**
 * Valideer een coupon. Retourneert null als geldig, of een foutmelding.
 */
export function validateCoupon(coupon: DbCoupon, plan: string): string | null {
  if (!coupon.active) return "Deze couponcode is niet meer geldig.";
  if (coupon.expires_at && new Date() > new Date(coupon.expires_at)) return "Deze couponcode is verlopen.";
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return "Deze couponcode is al maximaal gebruikt.";
  if (coupon.valid_for_plan && coupon.valid_for_plan !== plan) {
    return `Deze couponcode is alleen geldig voor ${coupon.valid_for_plan === "pro_event" ? "Pro Event" : "Pro Jaar"}.`;
  }
  return null;
}

export async function incrementCouponUsage(
  client: PgClient,
  schema: string,
  couponId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.coupons SET used_count = used_count + 1 WHERE id = $1;`,
    [couponId]
  );
}

export async function createCoupon(
  client: PgClient,
  schema: string,
  data: { code: string; discountCents: number; description?: string; validForPlan?: string; maxUses?: number; expiresAt?: string }
): Promise<DbCoupon> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO ${schema}.coupons (id, code, discount_cents, description, valid_for_plan, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7);`,
    [id, data.code.toUpperCase().trim(), data.discountCents, data.description ?? null, data.validForPlan ?? null, data.maxUses ?? null, data.expiresAt ?? null]
  );
  return {
    id, code: data.code.toUpperCase().trim(), discount_cents: data.discountCents,
    description: data.description ?? null, valid_for_plan: data.validForPlan ?? null,
    max_uses: data.maxUses ?? null, used_count: 0, expires_at: data.expiresAt ?? null,
    active: true, created_at: new Date().toISOString(),
  };
}

export async function listCoupons(
  client: PgClient,
  schema: string
): Promise<DbCoupon[]> {
  const result = await client.query<DbCoupon>(
    `SELECT * FROM ${schema}.coupons ORDER BY created_at DESC;`
  );
  return result.rows;
}

export async function toggleCouponActive(
  client: PgClient,
  schema: string,
  couponId: string,
  active: boolean
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.coupons SET active = $1 WHERE id = $2;`,
    [active, couponId]
  );
}

export async function deleteCoupon(
  client: PgClient,
  schema: string,
  couponId: string
): Promise<void> {
  await client.query(`DELETE FROM ${schema}.coupons WHERE id = $1;`, [couponId]);
}

// ── Admin: payments ──────────────────────────────────────────────────

export interface AdminPaymentRow {
  id: string;
  org_id: string;
  org_name: string;
  plan: string;
  amount_cents: number;
  status: string;
  provider_ref: string | null;
  coupon_id: string | null;
  description: string | null;
  invoice_number: string | null;
  created_at: string;
}

export async function adminListPayments(
  client: PgClient,
  schema: string,
  opts: { status?: string; limit?: number; offset?: number } = {}
): Promise<{ payments: AdminPaymentRow[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const where = opts.status ? `WHERE p.status = $1` : "";
  const params: unknown[] = opts.status ? [opts.status] : [];

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${schema}.payments p ${where};`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const dataParams = [...params, limit, offset];
  const result = await client.query<AdminPaymentRow>(
    `SELECT p.id, p.org_id, o.name AS org_name, p.plan, p.amount_cents, p.status,
            p.provider_ref, p.coupon_id, p.description, p.created_at,
            inv.invoice_number
     FROM ${schema}.payments p
     JOIN ${schema}.organizations o ON o.id = p.org_id
     LEFT JOIN ${schema}.invoices inv ON inv.payment_id = p.id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2};`,
    dataParams
  );

  return { payments: result.rows, total };
}

export async function adminUpdateOrgPlan(
  client: PgClient,
  schema: string,
  orgId: string,
  plan: string,
  expiresAt: string | null,
  frozen: boolean
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.organizations
     SET active_plan = $1, plan_expires_at = $2, plan_frozen = $3, updated_at = NOW()
     WHERE id = $4;`,
    [plan, expiresAt, frozen, orgId]
  );
}

// ── Logo ─────────────────────────────────────────────────────────────

export async function updateOrgLogo(
  client: PgClient,
  schema: string,
  orgId: string,
  logoData: string | null
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.organizations SET logo_data = $1, updated_at = NOW() WHERE id = $2;`,
    [logoData, orgId]
  );
}

// ── Billing ──────────────────────────────────────────────────────────

export async function updateOrgBilling(
  client: PgClient,
  schema: string,
  orgId: string,
  data: { billingType: string; companyName?: string; address?: string; postalCode?: string; city?: string; vatNumber?: string }
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.organizations
     SET billing_type = $1, billing_company_name = $2, billing_address = $3,
         billing_postal_code = $4, billing_city = $5, billing_vat_number = $6, updated_at = NOW()
     WHERE id = $7;`,
    [data.billingType, data.companyName ?? null, data.address ?? null,
     data.postalCode ?? null, data.city ?? null, data.vatNumber ?? null, orgId]
  );
}

// ── Invoices ─────────────────────────────────────────────────────────

export interface DbInvoice {
  id: string;
  invoice_number: string;
  payment_id: string | null;
  org_id: string;
  billing_type: string;
  billing_name: string;
  billing_email: string;
  billing_company_name: string | null;
  billing_address: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_vat_number: string | null;
  description: string;
  amount_cents: number;
  vat_cents: number;
  total_cents: number;
  pdf_data: string | null;
  created_at: string;
}

export async function getNextInvoiceNumber(
  client: PgClient,
  schema: string
): Promise<string> {
  const result = await client.query<{ nextval: string }>(
    `SELECT nextval('${schema}.invoice_number_seq');`
  );
  const seq = parseInt(result.rows[0].nextval, 10);
  const year = new Date().getFullYear();
  return `PJS-${year}-${String(seq).padStart(4, "0")}`;
}

export async function createInvoice(
  client: PgClient,
  schema: string,
  data: {
    paymentId: string | null;
    orgId: string;
    billingType: string;
    billingName: string;
    billingEmail: string;
    billingCompanyName?: string;
    billingAddress?: string;
    billingPostalCode?: string;
    billingCity?: string;
    billingVatNumber?: string;
    description: string;
    amountCents: number;
    vatCents: number;
    totalCents: number;
    pdfData?: string;
  }
): Promise<DbInvoice> {
  const id = randomUUID();
  const invoiceNumber = await getNextInvoiceNumber(client, schema);
  await client.query(
    `INSERT INTO ${schema}.invoices
     (id, invoice_number, payment_id, org_id, billing_type, billing_name, billing_email,
      billing_company_name, billing_address, billing_postal_code, billing_city, billing_vat_number,
      description, amount_cents, vat_cents, total_cents, pdf_data, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW());`,
    [id, invoiceNumber, data.paymentId, data.orgId, data.billingType,
     data.billingName, data.billingEmail,
     data.billingCompanyName ?? null, data.billingAddress ?? null,
     data.billingPostalCode ?? null, data.billingCity ?? null, data.billingVatNumber ?? null,
     data.description, data.amountCents, data.vatCents, data.totalCents, data.pdfData ?? null]
  );
  return {
    id, invoice_number: invoiceNumber, payment_id: data.paymentId, org_id: data.orgId,
    billing_type: data.billingType, billing_name: data.billingName, billing_email: data.billingEmail,
    billing_company_name: data.billingCompanyName ?? null, billing_address: data.billingAddress ?? null,
    billing_postal_code: data.billingPostalCode ?? null, billing_city: data.billingCity ?? null,
    billing_vat_number: data.billingVatNumber ?? null,
    description: data.description, amount_cents: data.amountCents,
    vat_cents: data.vatCents, total_cents: data.totalCents,
    pdf_data: data.pdfData ?? null, created_at: new Date().toISOString(),
  };
}

export async function listInvoicesForOrg(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<DbInvoice[]> {
  const result = await client.query<DbInvoice>(
    `SELECT * FROM ${schema}.invoices WHERE org_id = $1 ORDER BY created_at DESC;`,
    [orgId]
  );
  return result.rows;
}

export async function findInvoiceById(
  client: PgClient,
  schema: string,
  invoiceId: string
): Promise<DbInvoice | null> {
  const result = await client.query<DbInvoice>(
    `SELECT * FROM ${schema}.invoices WHERE id = $1 LIMIT 1;`,
    [invoiceId]
  );
  return result.rows[0] ?? null;
}

export async function adminListInvoices(
  client: PgClient,
  schema: string,
  opts: { limit?: number; offset?: number; from?: string; to?: string } = {}
): Promise<{ invoices: (DbInvoice & { org_name: string })[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.from) { conditions.push(`i.created_at >= $${idx}`); params.push(opts.from); idx++; }
  if (opts.to) { conditions.push(`i.created_at <= $${idx}`); params.push(opts.to + "T23:59:59Z"); idx++; }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${schema}.invoices i ${where};`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const dataParams = [...params, limit, offset];
  const result = await client.query<DbInvoice & { org_name: string; provider_ref: string | null }>(
    `SELECT i.*, o.name AS org_name, p.provider_ref FROM ${schema}.invoices i
     JOIN ${schema}.organizations o ON o.id = i.org_id
     LEFT JOIN ${schema}.payments p ON p.id = i.payment_id
     ${where}
     ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx + 1};`,
    dataParams
  );
  return { invoices: result.rows, total };
}

// ── Admin: revenue ──────────────────────────────────────────────────

export interface RevenueRow {
  month: string;
  plan: string;
  count: number;
  revenue_cents: number;
  coupon_discount_cents: number;
}

export async function adminGetRevenueByMonth(
  client: PgClient,
  schema: string
): Promise<RevenueRow[]> {
  const result = await client.query<RevenueRow>(
    `SELECT TO_CHAR(p.created_at, 'YYYY-MM') AS month,
            p.plan,
            COUNT(*)::int AS count,
            SUM(p.amount_cents)::int AS revenue_cents,
            COALESCE(SUM(c.discount_cents), 0)::int AS coupon_discount_cents
     FROM ${schema}.payments p
     LEFT JOIN ${schema}.coupons c ON c.id = p.coupon_id
     WHERE p.status = 'paid'
     GROUP BY TO_CHAR(p.created_at, 'YYYY-MM'), p.plan
     ORDER BY month DESC, p.plan;`
  );
  return result.rows;
}

// ── Admin: org configs/plans ─────────────────────────────────────────

export interface AdminOrgConfigRow {
  id: string;
  name: string;
  groups: number;
  stations: number;
  updated_at: string;
}

export async function adminListOrgConfigs(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<AdminOrgConfigRow[]> {
  const result = await client.query<{ id: string; payload: { name?: string; groups?: unknown[]; stations?: unknown[] }; updated_at: string }>(
    `SELECT id, payload, updated_at FROM ${schema}.planner_configs WHERE org_id = $1 ORDER BY updated_at DESC;`,
    [orgId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: (r.payload as { name?: string })?.name ?? "Naamloos",
    groups: Array.isArray((r.payload as { groups?: unknown[] })?.groups) ? (r.payload as { groups: unknown[] }).groups.length : 0,
    stations: Array.isArray((r.payload as { stations?: unknown[] })?.stations) ? (r.payload as { stations: unknown[] }).stations.length : 0,
    updated_at: r.updated_at,
  }));
}

export interface AdminOrgPlanRow {
  id: string;
  config_id: string;
  config_name: string;
  updated_at: string;
}

export async function adminListOrgPlans(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<AdminOrgPlanRow[]> {
  const result = await client.query<{ id: string; payload: { configId?: string }; updated_at: string }>(
    `SELECT id, payload, updated_at FROM ${schema}.planner_plans WHERE org_id = $1 ORDER BY updated_at DESC;`,
    [orgId]
  );
  // Haal config namen op
  const configs = await adminListOrgConfigs(client, schema, orgId);
  const configMap = new Map(configs.map((c) => [c.id, c.name]));
  return result.rows.map((r) => ({
    id: r.id,
    config_id: (r.payload as { configId?: string })?.configId ?? "",
    config_name: configMap.get((r.payload as { configId?: string })?.configId ?? "") ?? "Onbekend",
    updated_at: r.updated_at,
  }));
}

// ── Expiration warnings ──────────────────────────────────────────────

export interface ExpiringOrg {
  org_id: string;
  org_name: string;
  active_plan: string;
  expires_at: string;
  admin_emails: string[];
}

/**
 * Vind organisaties waarvan het plan over 1-3 dagen verloopt.
 * Retourneert alleen orgs die nog actief zijn (niet bevroren/geblokkeerd).
 */
export async function findExpiringOrgs(
  client: PgClient,
  schema: string
): Promise<ExpiringOrg[]> {
  const result = await client.query<{
    org_id: string;
    org_name: string;
    active_plan: string;
    expires_at: string;
    admin_emails: string;
  }>(
    `SELECT o.id AS org_id, o.name AS org_name, o.active_plan,
            COALESCE(o.plan_expires_at, o.trial_expires_at) AS expires_at,
            STRING_AGG(u.email, ',') AS admin_emails
     FROM ${schema}.organizations o
     JOIN ${schema}.memberships m ON m.org_id = o.id AND m.role = 'admin'
     JOIN ${schema}.users u ON u.id = m.user_id
     WHERE o.plan_frozen = FALSE
       AND (
         (o.active_plan = 'free' AND o.trial_expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days')
         OR (o.active_plan IN ('pro_event', 'pro_year') AND o.plan_expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days')
       )
     GROUP BY o.id, o.name, o.active_plan, o.plan_expires_at, o.trial_expires_at;`
  );

  return result.rows.map((r) => ({
    ...r,
    admin_emails: r.admin_emails.split(","),
  }));
}

// ── Activity log ──────────────────────────────────────────────────────

export interface DbActivityLog {
  id: string;
  user_id: string | null;
  org_id: string | null;
  action: string;
  detail: unknown;
  created_at: string;
}

export async function logActivity(
  client: PgClient,
  schema: string,
  data: { userId?: string; orgId?: string; action: string; detail?: unknown }
): Promise<void> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO ${schema}.activity_log (id, user_id, org_id, action, detail, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW());`,
    [id, data.userId ?? null, data.orgId ?? null, data.action, data.detail ? JSON.stringify(data.detail) : null]
  );
}

export async function adminListActivityLog(
  client: PgClient,
  schema: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ entries: Array<DbActivityLog & { user_email?: string; user_name?: string }>; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${schema}.activity_log;`
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const result = await client.query<DbActivityLog & { user_email?: string; user_name?: string }>(
    `SELECT a.id, a.user_id, a.org_id, a.action, a.detail, a.created_at,
            u.email AS user_email, u.name AS user_name
     FROM ${schema}.activity_log a
     LEFT JOIN ${schema}.users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2;`,
    [limit, offset]
  );

  return { entries: result.rows, total };
}
