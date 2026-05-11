import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { logActivity } from "@lib/server/db";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, orgRole, userId } = authResult.session;

  if (orgRole !== "admin") {
    return NextResponse.json({ error: "Alleen admins kunnen instellingen wijzigen." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Naam is verplicht." }, { status: 400 });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();
    await client.query(
      `UPDATE ${schema}.organizations SET name = $1, updated_at = NOW() WHERE id = $2;`,
      [name, orgId]
    );
    await logActivity(client, schema, { userId, orgId, action: "org.rename", detail: { newName: name } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Opslaan mislukt." },
      { status: 500 }
    );
  }
}
