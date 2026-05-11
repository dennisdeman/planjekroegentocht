import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSuperadmin } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";

/**
 * GET /api/admin/search?q=zoekterm
 * Doorzoekt gebruikers, organisaties en betalingen tegelijk.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ users: [], orgs: [], payments: [] });
  }

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();
  const pattern = `%${q}%`;

  const [users, orgs, payments] = await Promise.all([
    client.query<{ id: string; name: string; email: string; is_superadmin: boolean }>(
      `SELECT id, name, email, is_superadmin FROM ${schema}.users WHERE name ILIKE $1 OR email ILIKE $1 LIMIT 10;`,
      [pattern]
    ),
    client.query<{ id: string; name: string; slug: string; active_plan: string }>(
      `SELECT id, name, slug, active_plan FROM ${schema}.organizations WHERE name ILIKE $1 OR slug ILIKE $1 LIMIT 10;`,
      [pattern]
    ),
    client.query<{ id: string; org_name: string; plan: string; amount_cents: number; status: string; provider_ref: string | null }>(
      `SELECT p.id, o.name AS org_name, p.plan, p.amount_cents, p.status, p.provider_ref
       FROM ${schema}.payments p
       JOIN ${schema}.organizations o ON o.id = p.org_id
       WHERE o.name ILIKE $1 OR p.provider_ref ILIKE $1
       LIMIT 10;`,
      [pattern]
    ),
  ]);

  return NextResponse.json({
    users: users.rows,
    orgs: orgs.rows,
    payments: payments.rows,
  });
}
