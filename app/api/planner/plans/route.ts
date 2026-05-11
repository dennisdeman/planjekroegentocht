import { NextResponse } from "next/server";
import type { Plan } from "@core";
import { getPostgresPlannerStorage, getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { logActivity } from "@lib/server/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    const url = new URL(request.url);
    const configId = url.searchParams.get("configId") ?? undefined;
    const storage = await getPostgresPlannerStorage();
    const plans = await storage.listPlans(configId, orgId);
    return NextResponse.json({ plans });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list plans." },
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
    const payload = (await request.json()) as { plan?: Plan };
    if (!payload?.plan?.id) {
      return NextResponse.json({ error: "Missing plan payload." }, { status: 400 });
    }
    const storage = await getPostgresPlannerStorage();
    await storage.savePlan(payload.plan, orgId);
    await ensureMigrations();
    await logActivity(getClient(), getSchema(), { userId, orgId, action: "planner.save-plan", detail: { planId: payload.plan.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save plan." },
      { status: 500 }
    );
  }
}
