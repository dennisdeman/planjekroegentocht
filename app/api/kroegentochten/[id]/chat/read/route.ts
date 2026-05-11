import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { markChannelRead, buildParticipantKey } from "@lib/server/chat-db";

export const runtime = "nodejs";

interface RouteCtx { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const body = await request.json();
    const channel = typeof body.channel === "string" ? body.channel : "group";
    const participantKey = "admin";

    await markChannelRead(client, schema, id, channel, participantKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Markeren mislukt." }, { status: 500 });
  }
}
