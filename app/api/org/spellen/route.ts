import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { listOrgSpellen, initOrgSpellenFromRegistry, createOrgSpel } from "@lib/server/org-spellen-db";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    let spellen = await listOrgSpellen(client, schema, orgId);
    if (spellen.length === 0) {
      await initOrgSpellenFromRegistry(client, schema, orgId);
      spellen = await listOrgSpellen(client, schema, orgId);
    }

    return NextResponse.json({ spellen });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const body = await request.json();
    const { name } = body as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "Naam is verplicht." }, { status: 400 });
    }

    const client = getClient();
    const schema = getSchema();
    const spel = await createOrgSpel(client, schema, orgId, { name: name.trim() });

    return NextResponse.json({ spel });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aanmaken mislukt." },
      { status: 500 }
    );
  }
}
