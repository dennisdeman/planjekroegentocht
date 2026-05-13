import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import {
  deleteTeamMember,
  updateTeamMember,
  type UpdateTeamMemberPatch,
} from "@lib/server/team-members-db";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;
  const { id } = await context.params;

  try {
    const body = (await request.json()) as UpdateTeamMemberPatch;
    await ensureMigrations();
    const member = await updateTeamMember(getClient(), getSchema(), id, orgId, body);
    if (!member) {
      return NextResponse.json({ error: "Lid niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bijwerken mislukt." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;
  const { id } = await context.params;

  try {
    await ensureMigrations();
    const deleted = await deleteTeamMember(getClient(), getSchema(), id, orgId);
    if (!deleted) {
      return NextResponse.json({ error: "Lid niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verwijderen mislukt." },
      { status: 500 }
    );
  }
}
