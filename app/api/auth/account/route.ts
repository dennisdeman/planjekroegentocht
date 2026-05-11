import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findUserById, verifyPassword, updateUserName, changeUserPassword, logActivity } from "@lib/server/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult.session;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const { action, name, currentPassword, newPassword } = await request.json();

  if (action === "update-name") {
    if (!name?.trim()) {
      return NextResponse.json({ error: "Naam is verplicht." }, { status: 400 });
    }
    await updateUserName(client, schema, userId, name);
    await logActivity(client, schema, { userId, action: "user.update-name" });
    return NextResponse.json({ ok: true });
  }

  if (action === "change-password") {
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Huidig en nieuw wachtwoord zijn verplicht." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Nieuw wachtwoord moet minimaal 8 tekens zijn." }, { status: 400 });
    }

    const user = await findUserById(client, schema, userId);
    if (!user?.password_hash) {
      return NextResponse.json({ error: "Account heeft geen wachtwoord." }, { status: 400 });
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Huidig wachtwoord is onjuist." }, { status: 403 });
    }

    await changeUserPassword(client, schema, userId, newPassword);
    await logActivity(client, schema, { userId, action: "user.change-password" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
}
