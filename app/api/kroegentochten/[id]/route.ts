import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg, softDeleteKroegentocht, restoreKroegentocht, hardDeleteKroegentocht } from "@lib/server/kroegentocht-db";
import { logActivity } from "@lib/server/db";
import { deleteObject } from "@lib/server/r2";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "goLive");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();

    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    if (sd.liveStatus === "live") {
      return NextResponse.json(
        { error: "Een live kroegentocht kan niet verwijderd worden. Rond de kroegentocht eerst af." },
        { status: 400 }
      );
    }

    await softDeleteKroegentocht(client, schema, id);
    await logActivity(client, schema, { userId, orgId, action: "kroegentocht_deleted", detail: { kroegentochtId: id, name: sd.name } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verwijderen mislukt." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const body = await request.json();

    const client = getClient();
    const schema = getSchema();

    if (body.action === "restore") {
      await restoreKroegentocht(client, schema, id);
      await logActivity(client, schema, { userId, orgId, action: "kroegentocht_restored", detail: { kroegentochtId: id } });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "permanent-delete") {
      // Verwijder foto's uit R2 voordat DB-records cascade-verwijderd worden
      const photos = await client.query<{ file_key: string }>(
        `SELECT file_key FROM ${schema}.kroegentocht_photos WHERE kroegentocht_id = $1;`,
        [id]
      );
      await Promise.all(photos.rows.map((r) => deleteObject(r.file_key).catch(() => {})));

      await hardDeleteKroegentocht(client, schema, id);
      await logActivity(client, schema, { userId, orgId, action: "kroegentocht_hard_deleted", detail: { kroegentochtId: id } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ongeldige actie." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Herstellen mislukt." },
      { status: 500 }
    );
  }
}
