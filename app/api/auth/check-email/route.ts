import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findUserByEmail, verifyPassword } from "@lib/server/db";
import { checkRateLimit, getClientIp } from "@lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * Pre-login check: validates credentials and returns whether email is verified.
 * This allows the login page to show a specific message for unverified accounts
 * rather than a generic "invalid credentials" error.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(getClientIp(request), { prefix: "login", maxRequests: 10, windowSeconds: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Te veel inlogpogingen. Probeer het over enkele minuten opnieuw." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ valid: false });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const user = await findUserByEmail(client, schema, body.email);
    if (!user || !user.password_hash) {
      return NextResponse.json({ valid: false });
    }

    const passwordValid = await verifyPassword(body.password, user.password_hash);
    if (!passwordValid) {
      return NextResponse.json({ valid: false });
    }

    return NextResponse.json({
      valid: true,
      emailVerified: !!user.email_verified_at,
    });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
