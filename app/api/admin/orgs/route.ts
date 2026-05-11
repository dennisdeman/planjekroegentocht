import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSuperadmin } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { adminListOrgs, adminGetOrgDetail, adminUpdateOrgName, adminUpdateOrgPlan, adminDeleteOrg, adminListOrgConfigs, adminListOrgPlans, createMembership, deleteMembership, logActivity } from "@lib/server/db";

export async function GET(request: NextRequest) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const orgId = request.nextUrl.searchParams.get("id");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  if (orgId) {
    const detail = await adminGetOrgDetail(client, schema, orgId);
    if (!detail) return NextResponse.json({ error: "Organisatie niet gevonden." }, { status: 404 });
    const configs = await adminListOrgConfigs(client, schema, orgId);
    const plans = await adminListOrgPlans(client, schema, orgId);
    return NextResponse.json({ ...detail, configs, plans });
  }

  const result = await adminListOrgs(client, schema, { search, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const body = await request.json();
  const { action, orgId, name, userId, role, membershipId } = body;

  if (!orgId && action !== "add-member") {
    return NextResponse.json({ error: "orgId is verplicht." }, { status: 400 });
  }

  if (action === "rename") {
    if (!name?.trim()) {
      return NextResponse.json({ error: "Naam is verplicht." }, { status: 400 });
    }
    await adminUpdateOrgName(client, schema, orgId, name);
    await logActivity(client, schema, {
      userId: authResult.userId,
      orgId,
      action: "admin.org.rename",
      detail: { newName: name.trim() },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "add-member") {
    if (!orgId || !userId || !role) {
      return NextResponse.json({ error: "orgId, userId en role zijn verplicht." }, { status: 400 });
    }
    await createMembership(client, schema, { userId, orgId, role });
    await logActivity(client, schema, {
      userId: authResult.userId,
      orgId,
      action: "admin.org.add-member",
      detail: { targetUserId: userId, role },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "update-member-role") {
    const { membershipId: mid, newRole } = body;
    if (!mid || !["admin", "member"].includes(newRole)) {
      return NextResponse.json({ error: "membershipId en role (admin/member) zijn verplicht." }, { status: 400 });
    }
    await client.query(
      `UPDATE ${schema}.memberships SET role = $1 WHERE id = $2;`,
      [newRole, mid]
    );
    await logActivity(client, schema, {
      userId: authResult.userId,
      orgId,
      action: "admin.org.update-member-role",
      detail: { membershipId: mid, newRole },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove-member") {
    if (!membershipId) {
      return NextResponse.json({ error: "membershipId is verplicht." }, { status: 400 });
    }
    await deleteMembership(client, schema, membershipId);
    await logActivity(client, schema, {
      userId: authResult.userId,
      orgId,
      action: "admin.org.remove-member",
      detail: { membershipId },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "update-plan") {
    const { plan, expiresAt, frozen } = body;
    if (!["free", "pro_event", "pro_year"].includes(plan)) {
      return NextResponse.json({ error: "Ongeldig plan." }, { status: 400 });
    }
    await adminUpdateOrgPlan(client, schema, orgId, plan, expiresAt ?? null, frozen ?? false);
    await logActivity(client, schema, {
      userId: authResult.userId,
      orgId,
      action: "admin.org.update-plan",
      detail: { plan, expiresAt, frozen },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    await adminDeleteOrg(client, schema, orgId);
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.org.delete",
      detail: { orgId },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
}
