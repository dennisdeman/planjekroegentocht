import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { listMembersOfOrg, deleteMembership, getMembership, logActivity } from "@lib/server/db";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const members = await listMembersOfOrg(getClient(), getSchema(), orgId);
    return NextResponse.json({ members });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, orgRole, userId } = authResult.session;

  if (orgRole !== "admin") {
    return NextResponse.json({ error: "Alleen admins kunnen leden verwijderen." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { membershipId?: string };
    if (!body.membershipId) {
      return NextResponse.json({ error: "membershipId is verplicht." }, { status: 400 });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    // Prevent deleting yourself
    const membership = await getMembership(client, schema, userId, orgId);
    if (membership?.id === body.membershipId) {
      return NextResponse.json({ error: "Je kunt jezelf niet verwijderen." }, { status: 400 });
    }

    await deleteMembership(client, schema, body.membershipId);
    await logActivity(client, schema, { userId, orgId, action: "org.remove-member", detail: { membershipId: body.membershipId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verwijderen mislukt." },
      { status: 500 }
    );
  }
}
