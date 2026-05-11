import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { deleteObject } from "@lib/server/r2";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string; photoId: string }>;
}

export async function PATCH(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id, photoId } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const body = await request.json();
    if (typeof body.approved !== "boolean") {
      return NextResponse.json({ error: "approved is verplicht." }, { status: 400 });
    }

    const result = await client.query<{ id: string }>(
      `UPDATE ${schema}.kroegentocht_photos SET approved = $3 WHERE id = $1 AND kroegentocht_id = $2 RETURNING id;`,
      [photoId, id, body.approved]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Foto niet gevonden." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, approved: body.approved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foto bijwerken mislukt." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id, photoId } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const result = await client.query<{ file_key: string }>(
      `SELECT file_key FROM ${schema}.kroegentocht_photos WHERE id = $1 AND kroegentocht_id = $2;`,
      [photoId, id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Foto niet gevonden." }, { status: 404 });
    }

    const { file_key } = result.rows[0];

    // Verwijder uit R2 (best-effort — DB record wordt altijd verwijderd)
    await deleteObject(file_key).catch(() => {});

    await client.query(
      `DELETE FROM ${schema}.kroegentocht_photos WHERE id = $1;`,
      [photoId]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foto verwijderen mislukt." },
      { status: 500 }
    );
  }
}
