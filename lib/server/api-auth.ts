import { NextResponse } from "next/server";
import { auth } from "./auth";
import { getClient, getSchema, ensureMigrations } from "./postgres-storage";
import { isSuperadmin, findOrganizationById } from "./db";
import { resolveOrgPlanState, checkFeatureAccess, SUPERADMIN_PLAN_STATE, type OrgPlanState } from "./plan-limits";

interface ApiSession {
  userId: string;
  orgId: string;
  orgRole: "admin" | "member";
  userName: string;
}

type ApiResult =
  | { ok: true; session: ApiSession }
  | { ok: false; response: NextResponse };

export async function requireAuth(): Promise<ApiResult> {
  const session = await auth();
  if (!session?.user?.activeOrgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Niet ingelogd." }, { status: 401 }),
    };
  }
  return {
    ok: true,
    session: {
      userId: session.user.id,
      orgId: session.user.activeOrgId,
      orgRole: session.user.activeOrgRole,
      userName: session.user.name ?? "",
    },
  };
}

type SuperadminResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Check of een feature beschikbaar is voor de huidige organisatie.
 * Retourneert 403 als de feature niet beschikbaar is.
 */
export async function requireFeature(
  session: ApiSession,
  feature: "export" | "advice" | "fullValidation" | "saveTemplate" | "goLive" | "generate" | "edit"
): Promise<{ ok: true; planState: OrgPlanState } | { ok: false; response: NextResponse }> {
  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();
  // Superadmin bypast alle feature checks
  const superadmin = await isSuperadmin(client, schema, session.userId);
  if (superadmin) {
    return { ok: true, planState: SUPERADMIN_PLAN_STATE };
  }

  const org = await findOrganizationById(client, schema, session.orgId);
  if (!org) {
    return { ok: false, response: NextResponse.json({ error: "Organisatie niet gevonden." }, { status: 404 }) };
  }
  const planState = resolveOrgPlanState(org);
  const error = checkFeatureAccess(planState, feature);
  if (error) {
    return { ok: false, response: NextResponse.json({ error, upgrade: true }, { status: 403 }) };
  }
  return { ok: true, planState };
}

export async function requireSuperadmin(): Promise<SuperadminResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Niet ingelogd." }, { status: 401 }),
    };
  }
  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();
  const superadmin = await isSuperadmin(client, schema, session.user.id);
  if (!superadmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Geen toegang." }, { status: 403 }),
    };
  }
  return { ok: true, userId: session.user.id };
}
