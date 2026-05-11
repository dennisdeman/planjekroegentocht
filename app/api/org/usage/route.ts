import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();
    const [planRes, memberRes] = await Promise.all([
      client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${schema}.planner_plans WHERE org_id = $1;`, [orgId]),
      client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${schema}.memberships WHERE org_id = $1;`, [orgId]),
    ]);
    return NextResponse.json({
      planCount: parseInt(planRes.rows[0]?.count ?? "0", 10),
      memberCount: parseInt(memberRes.rows[0]?.count ?? "0", 10),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}
