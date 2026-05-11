import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findOrgSpel, updateOrgSpel, resetOrgSpelToDefault, deleteOrgSpel } from "@lib/server/org-spellen-db";
import type { MaterialItem, SpelExplanation } from "@core";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const body = await request.json();

    const client = getClient();
    const schema = getSchema();

    if (body.action === "reset") {
      const spel = await resetOrgSpelToDefault(client, schema, id, orgId);
      if (!spel) return NextResponse.json({ error: "Spel niet gevonden of geen standaardspel." }, { status: 404 });
      return NextResponse.json({ spel });
    }

    const input: { name?: string; materials?: MaterialItem[]; explanation?: SpelExplanation; isActive?: boolean } = {};
    if (body.name !== undefined) input.name = body.name;
    if (body.materials !== undefined) input.materials = body.materials;
    if (body.explanation !== undefined) input.explanation = body.explanation;
    if (body.isActive !== undefined) input.isActive = body.isActive;

    const spel = await updateOrgSpel(client, schema, id, orgId, input);
    if (!spel) return NextResponse.json({ error: "Spel niet gevonden." }, { status: 404 });

    return NextResponse.json({ spel });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Opslaan mislukt." },
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
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();

    const spel = await findOrgSpel(client, schema, id, orgId);
    if (!spel) return NextResponse.json({ error: "Spel niet gevonden." }, { status: 404 });

    await deleteOrgSpel(client, schema, id, orgId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verwijderen mislukt." },
      { status: 500 }
    );
  }
}
