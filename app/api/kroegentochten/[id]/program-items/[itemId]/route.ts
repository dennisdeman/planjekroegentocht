import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string; itemId: string }>;
}

export async function PATCH(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id, itemId } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const body = await request.json();
    const sets: string[] = [];
    const params: (string | number | null)[] = [itemId, id];
    let idx = 3;

    if (typeof body.title === "string") {
      sets.push(`title = $${idx}`);
      params.push(body.title.trim().slice(0, 200));
      idx++;
    }
    if (typeof body.description === "string") {
      sets.push(`description = $${idx}`);
      params.push(body.description.trim().slice(0, 500) || null);
      idx++;
    }
    if (typeof body.startTime === "string") {
      sets.push(`start_time = $${idx}`);
      params.push(new Date(body.startTime).toISOString());
      idx++;
    }
    if (typeof body.endTime === "string") {
      sets.push(`end_time = $${idx}`);
      params.push(body.endTime ? new Date(body.endTime).toISOString() : null);
      idx++;
    }
    if (typeof body.icon === "string") {
      sets.push(`icon = $${idx}`);
      params.push(body.icon.slice(0, 50));
      idx++;
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "Geen wijzigingen." }, { status: 400 });
    }

    const result = await client.query<{ id: string }>(
      `UPDATE ${schema}.kroegentocht_program_items SET ${sets.join(", ")} WHERE id = $1 AND kroegentocht_id = $2 RETURNING id;`,
      params
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Item niet gevonden." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Item bijwerken mislukt." },
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
    const { id, itemId } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    await client.query(
      `DELETE FROM ${schema}.kroegentocht_program_items WHERE id = $1 AND kroegentocht_id = $2;`,
      [itemId, id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Item verwijderen mislukt." },
      { status: 500 }
    );
  }
}
