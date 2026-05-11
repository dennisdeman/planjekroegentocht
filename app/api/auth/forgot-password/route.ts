import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findUserByEmail, createPasswordResetToken } from "@lib/server/db";
import { sendPasswordResetEmail } from "@lib/server/email";
import { checkRateLimit, getClientIp } from "@lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = checkRateLimit(getClientIp(request), { prefix: "forgot-pw", maxRequests: 3, windowSeconds: 300 });
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

    const resetToken = await createPasswordResetToken(client, schema, user.id);
    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password/${resetToken.token}`;
    await sendPasswordResetEmail({ to: user.email, resetUrl });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Versturen mislukt." },
      { status: 500 }
    );
  }
}
