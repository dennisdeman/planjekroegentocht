import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { createUser, createOrganization, createEmailVerificationToken, findUserByEmail, logActivity } from "@lib/server/db";
import { sendVerificationEmail } from "@lib/server/email";
import { checkRateLimit, getClientIp } from "@lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = checkRateLimit(getClientIp(request), { prefix: "register", maxRequests: 5, windowSeconds: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Te veel verzoeken. Probeer het later opnieuw." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as { email?: string; name?: string; password?: string; orgName?: string };
    const { email, name, password, orgName } = body;

    if (!email || !name || !password) {
      return NextResponse.json({ error: "Email, naam en wachtwoord zijn verplicht." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Wachtwoord moet minimaal 8 tekens zijn." }, { status: 400 });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const existing = await findUserByEmail(client, schema, email);
    if (existing) {
      return NextResponse.json({ error: "Er bestaat al een account met dit e-mailadres." }, { status: 409 });
    }

    const user = await createUser(client, schema, { email, name, password });
    const { org } = await createOrganization(client, schema, {
      name: orgName?.trim() || `${name.trim()}s organisatie`,
      createdByUserId: user.id,
    });
    await logActivity(client, schema, { userId: user.id, orgId: org.id, action: "user.register" });

    // Send verification email
    const verificationToken = await createEmailVerificationToken(client, schema, user.id);
    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const verifyUrl = `${baseUrl}/verify/${verificationToken.token}`;
    sendVerificationEmail({ to: user.email, verifyUrl }).catch((err) => {
      console.error("Failed to send verification email:", err);
    });

    return NextResponse.json({ ok: true, needsVerification: true }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Registratie mislukt." }, { status: 500 });
  }
}
