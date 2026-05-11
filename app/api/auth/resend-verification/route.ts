import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findUserByEmail, createEmailVerificationToken } from "@lib/server/db";
import { sendVerificationEmail } from "@lib/server/email";
import { checkRateLimit, getClientIp } from "@lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = checkRateLimit(getClientIp(request), { prefix: "resend-verify", maxRequests: 3, windowSeconds: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Te veel verzoeken. Probeer het later opnieuw." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as { email?: string };
    if (!body.email) {
      return NextResponse.json({ error: "E-mailadres is verplicht." }, { status: 400 });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const user = await findUserByEmail(client, schema, body.email);
    if (!user) {
      // Don't reveal whether email exists
      return NextResponse.json({ ok: true });
    }
    if (user.email_verified_at) {
      return NextResponse.json({ ok: true }); // Already verified
    }

    const verificationToken = await createEmailVerificationToken(client, schema, user.id);
    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const verifyUrl = `${baseUrl}/verify/${verificationToken.token}`;
    await sendVerificationEmail({ to: user.email, verifyUrl });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Versturen mislukt." },
      { status: 500 }
    );
  }
}
