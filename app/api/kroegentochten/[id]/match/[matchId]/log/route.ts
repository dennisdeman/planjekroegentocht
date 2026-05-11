import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { getMatchHistory } from "@lib/server/match-audit-log";
import { listTokensForPlan } from "@lib/server/live-tokens";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string; matchId: string }>;
}

export async function GET(_request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id, matchId } = await context.params;
    const client = getClient();
    const schema = getSchema();

    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const history = await getMatchHistory(client, schema, matchId);

    const tokens = await listTokensForPlan(client, schema, id, { onlyActive: false });
    const names: Record<string, string> = {};
    for (const t of tokens) {
      if (t.supervisorName) names[t.id] = t.supervisorName;
    }

    return NextResponse.json({ history, supervisorNames: names });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Geschiedenis laden mislukt." },
      { status: 500 }
    );
  }
}
