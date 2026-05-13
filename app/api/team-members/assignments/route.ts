import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { listMembershipsForConfig, setGroupMembers } from "@lib/server/team-members-db";

export const runtime = "nodejs";

async function configBelongsToOrg(configId: string, orgId: string): Promise<boolean> {
  const result = await getClient().query<{ org_id: string | null }>(
    `SELECT org_id FROM ${getSchema()}.planner_configs WHERE id = $1;`,
    [configId]
  );
  return result.rows[0]?.org_id === orgId;
}

export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  const configId = new URL(request.url).searchParams.get("configId");
  if (!configId) {
    return NextResponse.json({ error: "configId is verplicht." }, { status: 400 });
  }

  try {
    await ensureMigrations();
    if (!(await configBelongsToOrg(configId, orgId))) {
      return NextResponse.json({ error: "Geen toegang tot deze config." }, { status: 403 });
    }
    const assignments = await listMembershipsForConfig(getClient(), getSchema(), configId);
    return NextResponse.json({ assignments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}

interface PutBody {
  configId?: string;
  groupId?: string;
  memberIds?: string[];
}

export async function PUT(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    const body = (await request.json()) as PutBody;
    const { configId, groupId, memberIds } = body;
    if (!configId || !groupId || !Array.isArray(memberIds)) {
      return NextResponse.json(
        { error: "configId, groupId en memberIds (array) zijn verplicht." },
        { status: 400 }
      );
    }

    await ensureMigrations();
    if (!(await configBelongsToOrg(configId, orgId))) {
      return NextResponse.json({ error: "Geen toegang tot deze config." }, { status: 403 });
    }

    await setGroupMembers(getClient(), getSchema(), configId, groupId, memberIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Opslaan mislukt." },
      { status: 500 }
    );
  }
}
