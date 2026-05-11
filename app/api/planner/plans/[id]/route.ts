import { NextResponse } from "next/server";
import { getPostgresPlannerStorage, getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { requireAuth, requireFeature } from "@lib/server/api-auth";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    const { id } = await context.params;
    const storage = await getPostgresPlannerStorage();
    const plan = await storage.loadPlan(id, orgId);
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load plan." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "edit");
  if (!featureResult.ok) return featureResult.response;
  const { orgId } = authResult.session;

  try {
    const { id } = await context.params;
    const storage = await getPostgresPlannerStorage();
    await storage.deletePlan(id, orgId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete plan." },
      { status: 500 }
    );
  }
}
