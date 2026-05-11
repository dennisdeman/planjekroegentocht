import { NextResponse } from "next/server";
import { getPostgresPlannerStorage } from "@lib/server/postgres-storage";
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
    const config = await storage.loadConfig(id, orgId);
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load config." },
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
    await storage.deleteConfig(id, orgId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete config." },
      { status: 500 }
    );
  }
}
