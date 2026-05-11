import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import {
  createInvitation,
  listInvitationsForOrg,
  listMembersOfOrg,
  findUserByEmail,
  findOrganizationById,
  getMembership,
  logActivity,
} from "@lib/server/db";
import { sendInvitationEmail } from "@lib/server/email";
import { resolveOrgPlanState, checkTeamMemberLimit, SUPERADMIN_PLAN_STATE } from "@lib/server/plan-limits";
import { isSuperadmin } from "@lib/server/db";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, orgRole } = authResult.session;

  if (orgRole !== "admin") {
    return NextResponse.json({ error: "Alleen admins kunnen uitnodigingen zien." }, { status: 403 });
  }

  try {
    await ensureMigrations();
    const invitations = await listInvitationsForOrg(getClient(), getSchema(), orgId);
    return NextResponse.json({ invitations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, orgRole, userId } = authResult.session;

  if (orgRole !== "admin") {
    return NextResponse.json({ error: "Alleen admins kunnen uitnodigen." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { email?: string; role?: "admin" | "member" };
    const email = body.email?.toLowerCase().trim();
    const role = body.role === "admin" ? "admin" : "member";

    if (!email) {
      return NextResponse.json({ error: "E-mailadres is verplicht." }, { status: 400 });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    // Check teamlid-limiet (superadmin bypass)
    const isAdmin = await isSuperadmin(client, schema, userId);
    if (!isAdmin) {
      const org = await findOrganizationById(client, schema, orgId);
      if (org) {
        const planState = resolveOrgPlanState(org);
        const members = await listMembersOfOrg(client, schema, orgId);
        const limitError = checkTeamMemberLimit(planState, members.length);
        if (limitError) {
          return NextResponse.json({ error: limitError }, { status: 403 });
        }
      }
    }

    // Check if user is already a member
    const existingUser = await findUserByEmail(client, schema, email);
    if (existingUser) {
      const existingMembership = await getMembership(client, schema, existingUser.id, orgId);
      if (existingMembership) {
        return NextResponse.json(
          { error: "Deze gebruiker is al lid van de organisatie." },
          { status: 409 }
        );
      }
    }

    const invitation = await createInvitation(client, schema, {
      orgId,
      email,
      role,
      invitedBy: userId,
    });
    await logActivity(client, schema, { userId, orgId, action: "org.invite", detail: { email, role } });

    // Send email (non-blocking — don't fail the request if email fails)
    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite/${invitation.token}`;
    sendInvitationEmail({ to: email, inviteUrl, orgName: "" }).catch((err) => {
      console.error("Failed to send invitation email:", err);
    });

    return NextResponse.json({ ok: true, invitation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Uitnodigen mislukt." },
      { status: 500 }
    );
  }
}
