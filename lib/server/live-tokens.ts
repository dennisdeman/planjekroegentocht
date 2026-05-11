import { randomBytes } from "node:crypto";
import type { PgClient } from "@storage";
import type { LiveRole, LiveAccessToken } from "@core";
import { checkRateLimit } from "./rate-limit";

const TOKEN_BYTES = 18;
const DEFAULT_EXPIRY_HOURS = 48;
const TOKEN_RATE_LIMIT = { prefix: "live-token", maxRequests: 60, windowSeconds: 60 };

export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export interface CreateTokenInput {
  kroegentochtId: string;
  role: LiveRole;
  scopeId?: string | null;
  expiresInHours?: number;
}

export interface CreateTokenResult {
  id: string;
  rawToken: string;
  role: LiveRole;
  scopeId: string | null;
  expiresAt: string | null;
}

export async function createLiveToken(
  client: PgClient,
  schema: string,
  input: CreateTokenInput
): Promise<CreateTokenResult> {
  const rawToken = generateRawToken();
  const hours = input.expiresInHours ?? DEFAULT_EXPIRY_HOURS;
  const expiresAt = hours > 0 ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;

  const result = await client.query<{ id: string; expires_at: string | null }>(
    `INSERT INTO ${schema}.live_access_tokens (kroegentocht_id, role, scope_id, token, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, expires_at;`,
    [input.kroegentochtId, input.role, input.scopeId ?? null, rawToken, expiresAt]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    rawToken,
    role: input.role,
    scopeId: input.scopeId ?? null,
    expiresAt: row.expires_at,
  };
}

export interface VerifiedToken {
  id: string;
  kroegentochtId: string;
  role: LiveRole;
  scopeId: string | null;
  supervisorName: string | null;
  expiresAt: string | null;
}

export async function verifyLiveToken(
  client: PgClient,
  schema: string,
  rawToken: string
): Promise<VerifiedToken | null> {
  if (!rawToken || rawToken.length < 10) return null;

  const result = await client.query<{
    id: string;
    kroegentocht_id: string;
    role: string;
    scope_id: string | null;
    supervisor_name: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }>(
    `SELECT id, kroegentocht_id, role, scope_id, supervisor_name, expires_at, revoked_at
     FROM ${schema}.live_access_tokens
     WHERE token = $1;`,
    [rawToken]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  await client.query(
    `UPDATE ${schema}.live_access_tokens
     SET last_used_at = NOW(), use_count = use_count + 1
     WHERE id = $1;`,
    [row.id]
  );

  return {
    id: row.id,
    kroegentochtId: row.kroegentocht_id,
    role: row.role as LiveRole,
    scopeId: row.scope_id,
    supervisorName: row.supervisor_name,
    expiresAt: row.expires_at,
  };
}

export function checkTokenRateLimit(tokenId: string): { allowed: boolean; retryAfterSeconds: number } {
  const res = checkRateLimit(tokenId, TOKEN_RATE_LIMIT);
  return { allowed: res.allowed, retryAfterSeconds: res.retryAfterSeconds };
}

export async function revokeLiveToken(
  client: PgClient,
  schema: string,
  tokenId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.live_access_tokens
     SET revoked_at = NOW()
     WHERE id = $1 AND revoked_at IS NULL;`,
    [tokenId]
  );
}

export async function revokeAllTokensForPlan(
  client: PgClient,
  schema: string,
  kroegentochtId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.live_access_tokens
     SET revoked_at = NOW()
     WHERE kroegentocht_id = $1 AND revoked_at IS NULL;`,
    [kroegentochtId]
  );
}

export interface LiveAccessTokenWithRaw extends LiveAccessToken {
  rawToken: string | null;
}

export async function listTokensForPlan(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  options?: { onlyActive?: boolean }
): Promise<LiveAccessTokenWithRaw[]> {
  const onlyActive = options?.onlyActive ?? false;
  const result = await client.query<{
    id: string;
    kroegentocht_id: string;
    role: string;
    scope_id: string | null;
    supervisor_name: string | null;
    token: string | null;
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
    use_count: number;
  }>(
    `SELECT id, kroegentocht_id, role, scope_id, supervisor_name, token, created_at, expires_at, revoked_at, last_used_at, use_count
     FROM ${schema}.live_access_tokens
     WHERE kroegentocht_id = $1
       ${onlyActive ? "AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())" : ""}
     ORDER BY role, scope_id NULLS FIRST, created_at DESC;`,
    [kroegentochtId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    kroegentochtId: r.kroegentocht_id,
    role: r.role as LiveRole,
    scopeId: r.scope_id,
    supervisorName: r.supervisor_name,
    rawToken: r.token,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
  }));
}

export async function revokeActiveTokenByRoleAndScope(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  role: LiveRole,
  scopeId: string | null
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.live_access_tokens
     SET revoked_at = NOW()
     WHERE kroegentocht_id = $1
       AND role = $2
       AND ((scope_id IS NULL AND $3::text IS NULL) OR scope_id = $3)
       AND revoked_at IS NULL;`,
    [kroegentochtId, role, scopeId]
  );
}

export async function extendTokenExpiry(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  hours: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  await client.query(
    `UPDATE ${schema}.live_access_tokens
     SET expires_at = $2
     WHERE kroegentocht_id = $1 AND revoked_at IS NULL;`,
    [kroegentochtId, expiresAt]
  );
}

export async function setSupervisorName(
  client: PgClient,
  schema: string,
  tokenId: string,
  name: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.live_access_tokens SET supervisor_name = $2 WHERE id = $1;`,
    [tokenId, name]
  );
}

/**
 * Genereer alle benodigde tokens bij go-live: 1 supervisor per station,
 * 1 program, 1 scoreboard. Bestaande actieve tokens voor dezelfde scope
 * worden eerst gerevoked, zodat er nooit twee actieve tokens per (rol, scope) zijn.
 */
export async function autoGenerateTokensForPlan(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  stationIds: string[]
): Promise<CreateTokenResult[]> {
  const created: CreateTokenResult[] = [];

  // Program + Scoreboard (globaal, geen scope)
  for (const role of ["program", "scoreboard"] as const) {
    await revokeActiveTokenByRoleAndScope(client, schema, kroegentochtId, role, null);
    created.push(await createLiveToken(client, schema, { kroegentochtId, role, scopeId: null }));
  }

  // Supervisor per station
  for (const stationId of stationIds) {
    await revokeActiveTokenByRoleAndScope(client, schema, kroegentochtId, "supervisor", stationId);
    created.push(await createLiveToken(client, schema, { kroegentochtId, role: "supervisor", scopeId: stationId }));
  }

  return created;
}
