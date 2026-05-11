import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken, checkTokenRateLimit } from "@lib/server/live-tokens";
import { markChannelRead, buildParticipantKey } from "@lib/server/chat-db";

export const runtime = "nodejs";

interface RouteCtx { params: Promise<{ token: string }> }

export async function POST(request: Request, context: RouteCtx) {
  try {
    const { token } = await context.params;
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const verified = await verifyLiveToken(client, schema, token);
    if (!verified || verified.role !== "supervisor") {
      return NextResponse.json({ error: "Link is ongeldig of verlopen." }, { status: 401 });
    }

    const rl = checkTokenRateLimit(verified.id);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Te veel verzoeken." }, { status: 429 });
    }

    const body = await request.json();
    const channel = typeof body.channel === "string" ? body.channel : "group";
    const participantKey = buildParticipantKey("supervisor", verified.id);

    await markChannelRead(client, schema, verified.kroegentochtId, channel, participantKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Markeren mislukt." }, { status: 500 });
  }
}
