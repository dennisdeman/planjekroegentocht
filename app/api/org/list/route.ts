import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { listMembershipsForUser } from "@lib/server/db";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult.session;

  try {
    await ensureMigrations();
    const memberships = await listMembershipsForUser(getClient(), getSchema(), userId);
    const orgs = memberships.map((m) => ({
      orgId: m.org_id,
      orgName: m.org_name,
      orgSlug: m.org_slug,
      role: m.role,
    }));
    return NextResponse.json({ orgs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}
