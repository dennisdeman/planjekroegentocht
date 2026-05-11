import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg, updateKroegentochtScheduleOffset } from "@lib/server/kroegentocht-db";
import { logActivity } from "@lib/server/db";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "goLive");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const body = await request.json();
    const deltaSeconds = body.deltaSeconds as number | undefined;

    if (typeof deltaSeconds !== "number" || !Number.isFinite(deltaSeconds)) {
      return NextResponse.json({ error: "deltaSeconds vereist." }, { status: 400 });
    }

    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });
    if (sd.liveStatus !== "live") {
      return NextResponse.json({ error: "Kroegentocht is niet live." }, { status: 400 });
    }

    const newOffset = await updateKroegentochtScheduleOffset(client, schema, id, deltaSeconds);
    await logActivity(client, schema, { userId, orgId, action: "kroegentocht_schedule_adjusted", detail: { kroegentochtId: id, deltaSeconds, newOffset } });

    return NextResponse.json({ scheduleOffsetSeconds: newOffset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kon schema niet aanpassen." },
      { status: 500 }
    );
  }
}
