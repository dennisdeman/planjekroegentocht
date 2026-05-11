import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { sendMessage, getMessages, buildParticipantKey, canAccessChannel } from "@lib/server/chat-db";
import { sendPushToChannel } from "@lib/server/push-notifications";

export const runtime = "nodejs";

interface RouteCtx { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteCtx) {
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

    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") ?? "group";
    const since = url.searchParams.get("since") ?? undefined;
    const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50);

    const participantKey = "admin";
    if (!canAccessChannel(channel, participantKey)) {
      return NextResponse.json({ error: "Geen toegang tot dit kanaal." }, { status: 403 });
    }

    const messages = await getMessages(client, schema, id, channel, since, limit);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chat laden mislukt." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, userId, userName } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const body = await request.json();
    const channel = typeof body.channel === "string" ? body.channel : "group";
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 2000) : "";
    const isBroadcast = body.isBroadcast === true;

    if (!content) return NextResponse.json({ error: "Bericht mag niet leeg zijn." }, { status: 400 });

    const participantKey = "admin";
    if (!canAccessChannel(channel, participantKey)) {
      return NextResponse.json({ error: "Geen toegang tot dit kanaal." }, { status: 403 });
    }

    const displayName = sd.adminName || userName || "Beheerder";

    const effectiveChannel = isBroadcast ? "group" : channel;
    const msg = await sendMessage(client, schema, {
      kroegentochtId: id,
      channelKey: effectiveChannel,
      senderType: "admin",
      senderId: userId,
      senderName: displayName,
      content,
      isBroadcast,
    });

    sendPushToChannel(client, schema, id, effectiveChannel, participantKey, {
      title: isBroadcast ? `📢 ${displayName}` : displayName,
      body: content.slice(0, 200),
      url: `/kroegentochten/${id}`,
      tag: `chat-${id}-${effectiveChannel}`,
    }).catch(() => {});

    return NextResponse.json({ message: msg });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bericht sturen mislukt." }, { status: 500 });
  }
}
