import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import {
  createTeamMember,
  listTeamMembersForOrg,
} from "@lib/server/team-members-db";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const members = await listTeamMembersForOrg(getClient(), getSchema(), orgId);
    return NextResponse.json({ members });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}

interface CreateBody {
  name?: string;
  email?: string | null;
  phone?: string | null;
  is18Plus?: boolean;
  notes?: string | null;
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    const body = (await request.json()) as CreateBody;
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Naam is verplicht." }, { status: 400 });
    }

    await ensureMigrations();
    const member = await createTeamMember(getClient(), getSchema(), {
      orgId,
      name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      is18Plus: body.is18Plus ?? false,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Opslaan mislukt." },
      { status: 500 }
    );
  }
}
