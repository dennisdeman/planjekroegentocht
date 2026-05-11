import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken, checkTokenRateLimit } from "@lib/server/live-tokens";
import { savePushSubscription, removePushSubscription } from "@lib/server/push-notifications";

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
    const { endpoint, keys } = body.subscription ?? body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Ongeldige subscription." }, { status: 400 });
    }

    const participantKey = `sv:${verified.id}`;
    await savePushSubscription(client, schema, {
      kroegentochtId: verified.kroegentochtId,
      participantKey,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Subscription opslaan mislukt." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteCtx) {
  try {
    const { token } = await context.params;
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const verified = await verifyLiveToken(client, schema, token);
    if (!verified || verified.role !== "supervisor") {
      return NextResponse.json({ error: "Link is ongeldig of verlopen." }, { status: 401 });
    }

    const body = await request.json();
    const endpoint = body.endpoint;
    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint is verplicht." }, { status: 400 });
    }

    await removePushSubscription(client, schema, verified.kroegentochtId, `sv:${verified.id}`, endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unsubscribe mislukt." }, { status: 500 });
  }
}
