import { NextResponse } from "next/server";
import type { Config } from "@core";
import { getPostgresPlannerStorage, getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { logActivity } from "@lib/server/db";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    const storage = await getPostgresPlannerStorage();
    const configs = await storage.listConfigs(orgId);
    return NextResponse.json({ configs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list configs." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "edit");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    const payload = (await request.json()) as { config?: Config };
    if (!payload?.config?.id) {
      return NextResponse.json({ error: "Missing config payload." }, { status: 400 });
    }
    const storage = await getPostgresPlannerStorage();
    await storage.saveConfig(payload.config, orgId);
    await ensureMigrations();
    await logActivity(getClient(), getSchema(), { userId, orgId, action: "planner.save-config", detail: { configId: payload.config.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save config." },
      { status: 500 }
    );
  }
}
