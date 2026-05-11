import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const result = await client.query<{
      id: string; title: string; description: string | null;
      start_time: string; end_time: string | null; icon: string;
      sort_order: number; created_at: string;
    }>(
      `SELECT id, title, description, start_time, end_time, icon, sort_order, created_at
       FROM ${schema}.kroegentocht_program_items WHERE kroegentocht_id = $1
       ORDER BY start_time ASC, sort_order ASC;`,
      [id]
    );

    return NextResponse.json({
      items: result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        startTime: r.start_time,
        endTime: r.end_time,
        icon: r.icon,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Items ophalen mislukt." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime || null : null;
    const icon = typeof body.icon === "string" ? body.icon.slice(0, 50) : "event";

    if (!title) return NextResponse.json({ error: "Titel is verplicht." }, { status: 400 });
    if (!startTime) return NextResponse.json({ error: "Starttijd is verplicht." }, { status: 400 });

    const result = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO ${schema}.kroegentocht_program_items
         (kroegentocht_id, title, description, start_time, end_time, icon)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at;`,
      [id, title, description, new Date(startTime).toISOString(), endTime ? new Date(endTime).toISOString() : null, icon]
    );

    return NextResponse.json({
      item: {
        id: result.rows[0].id,
        title,
        description,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        icon,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Item aanmaken mislukt." },
      { status: 500 }
    );
  }
}
