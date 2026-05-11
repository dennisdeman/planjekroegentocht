import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findValidPasswordResetToken, resetPassword, logActivity } from "@lib/server/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; password?: string };
    if (!body.token || !body.password) {
      return NextResponse.json({ error: "Token en wachtwoord zijn verplicht." }, { status: 400 });
    }
    if (body.password.length < 8) {
      return NextResponse.json({ error: "Wachtwoord moet minimaal 8 tekens zijn." }, { status: 400 });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const record = await findValidPasswordResetToken(client, schema, body.token);
    if (!record) {
      return NextResponse.json({ error: "Link ongeldig of verlopen." }, { status: 404 });
    }

    await resetPassword(client, schema, record.user_id, record.id, body.password);
    await logActivity(client, schema, { userId: record.user_id, action: "user.reset-password" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Resetten mislukt." },
      { status: 500 }
    );
  }
}
