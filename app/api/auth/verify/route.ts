import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findValidVerificationToken, markEmailVerified, logActivity } from "@lib/server/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };
    if (!body.token) {
      return NextResponse.json({ error: "Token ontbreekt." }, { status: 400 });
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const record = await findValidVerificationToken(client, schema, body.token);
    if (!record) {
      return NextResponse.json({ error: "Verificatielink ongeldig of verlopen." }, { status: 404 });
    }

    await markEmailVerified(client, schema, record.user_id, record.id);
    await logActivity(client, schema, { userId: record.user_id, action: "user.verify-email" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verificatie mislukt." },
      { status: 500 }
    );
  }
}
