import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { savePushSubscription, removePushSubscription } from "@lib/server/push-notifications";

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
    const { endpoint, keys } = body.subscription ?? body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Ongeldige subscription." }, { status: 400 });
    }

    await savePushSubscription(client, schema, {
      kroegentochtId: id,
      participantKey: "admin",
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
    const endpoint = body.endpoint;
    if (!endpoint) return NextResponse.json({ error: "Endpoint is verplicht." }, { status: 400 });

    await removePushSubscription(client, schema, id, `admin:${userId}`, endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unsubscribe mislukt." }, { status: 500 });
  }
}
