import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken, checkTokenRateLimit } from "@lib/server/live-tokens";
import { sendMessage, getMessages, buildParticipantKey, canAccessChannel } from "@lib/server/chat-db";
import { sendPushToChannel } from "@lib/server/push-notifications";

export const runtime = "nodejs";

interface RouteCtx { params: Promise<{ token: string }> }

export async function GET(request: Request, context: RouteCtx) {
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

    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") ?? "group";
    const since = url.searchParams.get("since") ?? undefined;
    const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50);

    const participantKey = buildParticipantKey("supervisor", verified.id);
    if (!canAccessChannel(channel, participantKey)) {
      return NextResponse.json({ error: "Geen toegang tot dit kanaal." }, { status: 403 });
    }

    const messages = await getMessages(client, schema, verified.kroegentochtId, channel, since, limit);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chat laden mislukt." }, { status: 500 });
  }
}

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
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 2000) : "";

    if (!content) return NextResponse.json({ error: "Bericht mag niet leeg zijn." }, { status: 400 });

    const participantKey = buildParticipantKey("supervisor", verified.id);
    if (!canAccessChannel(channel, participantKey)) {
      return NextResponse.json({ error: "Geen toegang tot dit kanaal." }, { status: 403 });
    }

    const senderName = verified.supervisorName ?? "Spelbegeleider";

    const msg = await sendMessage(client, schema, {
      kroegentochtId: verified.kroegentochtId,
      channelKey: channel,
      senderType: "supervisor",
      senderId: verified.id,
      senderName,
      content,
    });

    sendPushToChannel(client, schema, verified.kroegentochtId, channel, participantKey, {
      title: senderName,
      body: content.slice(0, 200),
      url: `/live/${verified.kroegentochtId}/supervise/${token}`,
      tag: `chat-${verified.kroegentochtId}-${channel}`,
    }).catch(() => {});

    return NextResponse.json({ message: msg });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bericht sturen mislukt." }, { status: 500 });
  }
}
