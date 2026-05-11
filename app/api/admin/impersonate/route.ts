import { NextResponse } from "next/server";
import { requireSuperadmin } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findUserById, listMembershipsForUser, findOrganizationById, logActivity } from "@lib/server/db";
import { resolveOrgPlanState } from "@lib/server/plan-limits";
import { encode } from "next-auth/jwt";

/**
 * POST /api/admin/impersonate
 * Genereert een NextAuth sessie-token voor een andere gebruiker.
 * Alleen beschikbaar voor superadmins.
 */
export async function POST(request: Request) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId is verplicht." }, { status: 400 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET niet geconfigureerd." }, { status: 500 });
  }

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const user = await findUserById(client, schema, userId);
  if (!user) {
    return NextResponse.json({ error: "Gebruiker niet gevonden." }, { status: 404 });
  }

  const memberships = await listMembershipsForUser(client, schema, userId);
  const firstOrg = memberships[0];

  let planState = undefined;
  if (firstOrg) {
    const org = await findOrganizationById(client, schema, firstOrg.org_id);
    if (org) planState = resolveOrgPlanState(org);
  }

  await logActivity(client, schema, {
    userId: authResult.userId,
    action: "admin.impersonate",
    detail: { targetUserId: userId, targetEmail: user.email },
  });

  // Genereer NextAuth-compatibel JWT token
  const tokenPayload: Record<string, unknown> = {
    userId: user.id,
    email: user.email,
    name: user.name,
    isSuperadmin: false,
    activeOrgId: firstOrg?.org_id ?? "",
    activeOrgName: firstOrg?.org_name ?? "",
    activeOrgRole: firstOrg?.role ?? "member",
    planState,
  };
  // salt = cookie naam die NextAuth gebruikt
  const useSecureCookie = process.env.AUTH_URL?.startsWith("https://") ?? false;
  const salt = useSecureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await encode({ token: tokenPayload, secret, salt, maxAge: 60 * 60 });

  // Cookie server-side zetten via Set-Cookie header
  const useSecureCookieForResponse = process.env.AUTH_URL?.startsWith("https://") ?? false;
  const cookieName = useSecureCookieForResponse ? "__Secure-authjs.session-token" : "authjs.session-token";
  const securePart = useSecureCookieForResponse ? "; Secure" : "";

  const response = NextResponse.json({ ok: true, email: user.email, name: user.name });
  response.cookies.set(cookieName, token, {
    path: "/",
    maxAge: 3600,
    sameSite: "lax",
    secure: useSecureCookieForResponse,
    httpOnly: true,
  });
  return response;
}
