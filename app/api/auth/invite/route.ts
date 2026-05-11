import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import {
  findInvitationByToken,
  acceptInvitation,
  createMembership,
  findUserByEmail,
  createUser,
  markEmailVerifiedByUserId,
  logActivity,
} from "@lib/server/db";

export const runtime = "nodejs";

/**
 * GET: Validate token and return invitation details (used by invite page to show org name).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token ontbreekt." }, { status: 400 });
  }

  try {
    await ensureMigrations();
    const invitation = await findInvitationByToken(getClient(), getSchema(), token);
    if (!invitation) {
      return NextResponse.json({ error: "Uitnodiging ongeldig of verlopen." }, { status: 404 });
    }
    return NextResponse.json({
      email: invitation.email,
      orgName: invitation.org_name,
      role: invitation.role,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}

/**
 * POST: Accept invitation. If user doesn't exist, create account first.
 * Body: { token, name?, password? }
 * - Existing user: just token is enough (we look up by email)
 * - New user: name + password required to create account
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      name?: string;
      password?: string;
    };
    const { token, name, password } = body;

    if (!token) {
      return NextResponse.json({ error: "Token ontbreekt." }, { status: 400 });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const invitation = await findInvitationByToken(client, schema, token);
    if (!invitation) {
      return NextResponse.json({ error: "Uitnodiging ongeldig of verlopen." }, { status: 404 });
    }

    let user = await findUserByEmail(client, schema, invitation.email);

    if (!user) {
      // New user — must provide name and password
      if (!name || !password) {
        return NextResponse.json(
          { error: "Naam en wachtwoord zijn verplicht voor een nieuw account." },
          { status: 400 }
        );
      }
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Wachtwoord moet minimaal 8 tekens zijn." },
          { status: 400 }
        );
      }
      user = await createUser(client, schema, {
        email: invitation.email,
        name,
        password,
      });
    }

    // Invited users have a proven email address — mark verified
    if (!user.email_verified_at) {
      await markEmailVerifiedByUserId(client, schema, user.id);
    }

    // Create membership
    await createMembership(client, schema, {
      userId: user.id,
      orgId: invitation.org_id,
      role: invitation.role,
    });

    // Mark invitation as accepted
    await acceptInvitation(client, schema, invitation.id);
    await logActivity(client, schema, { userId: user.id, orgId: invitation.org_id, action: "user.accept-invite" });

    return NextResponse.json({ ok: true, needsLogin: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accepteren mislukt." },
      { status: 500 }
    );
  }
}
