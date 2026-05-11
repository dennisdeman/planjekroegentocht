import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { createConfigTemplate, listConfigTemplates, deleteConfigTemplate } from "@lib/server/db";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const templates = await listConfigTemplates(getClient(), getSchema(), orgId);
    return NextResponse.json({ templates });
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
  const featureResult = await requireFeature(authResult.session, "saveTemplate");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    const body = (await request.json()) as { name?: string; payload?: unknown };
    if (!body.name?.trim() || !body.payload) {
      return NextResponse.json({ error: "Naam en configuratie zijn verplicht." }, { status: 400 });
    }

    await ensureMigrations();
    const template = await createConfigTemplate(getClient(), getSchema(), {
      orgId,
      name: body.name,
      payload: body.payload,
      createdBy: userId,
    });

    return NextResponse.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Opslaan mislukt." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    const body = (await request.json()) as { templateId?: string };
    if (!body.templateId) {
      return NextResponse.json({ error: "templateId is verplicht." }, { status: 400 });
    }

    await ensureMigrations();
    await deleteConfigTemplate(getClient(), getSchema(), body.templateId, orgId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verwijderen mislukt." },
      { status: 500 }
    );
  }
}
