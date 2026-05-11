import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSuperadmin } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { adminListUsers, adminGetUserDetail, adminVerifyUserEmail, adminResetUserPassword, adminDeleteUser, logActivity } from "@lib/server/db";

export async function GET(request: NextRequest) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const userId = request.nextUrl.searchParams.get("id");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  if (userId) {
    const detail = await adminGetUserDetail(client, schema, userId);
    if (!detail) return NextResponse.json({ error: "Gebruiker niet gevonden." }, { status: 404 });
    return NextResponse.json(detail);
  }

  const result = await adminListUsers(client, schema, { search, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const body = await request.json();
  const { action, userId, newPassword } = body;

  if (!userId) {
    return NextResponse.json({ error: "userId is verplicht." }, { status: 400 });
  }

  if (action === "update-user") {
    const { name: newName, email: newEmail } = body;
    if (!newName?.trim() && !newEmail?.trim()) {
      return NextResponse.json({ error: "Naam of email is verplicht." }, { status: 400 });
    }
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (newName?.trim()) { updates.push(`name = $${idx}`); params.push(newName.trim()); idx++; }
    if (newEmail?.trim()) { updates.push(`email = $${idx}`); params.push(newEmail.trim().toLowerCase()); idx++; }
    updates.push(`updated_at = NOW()`);
    params.push(userId);
    await client.query(
      `UPDATE ${schema}.users SET ${updates.join(", ")} WHERE id = $${idx};`,
      params
    );
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.user.update",
      detail: { targetUserId: userId, newName: newName?.trim(), newEmail: newEmail?.trim() },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "verify-email") {
    await adminVerifyUserEmail(client, schema, userId);
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.user.verify-email",
      detail: { targetUserId: userId },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "reset-password") {
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: "Wachtwoord moet minimaal 8 tekens zijn." }, { status: 400 });
    }
    await adminResetUserPassword(client, schema, userId, newPassword);
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.user.reset-password",
      detail: { targetUserId: userId },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle-superadmin") {
    if (userId === authResult.userId) {
      return NextResponse.json({ error: "Je kunt je eigen superadmin-status niet wijzigen." }, { status: 400 });
    }
    const { isSuperadmin: currentValue } = await import("@lib/server/db").then((m) => m.isSuperadmin(client, schema, userId).then((v) => ({ isSuperadmin: v })));
    await client.query(
      `UPDATE ${schema}.users SET is_superadmin = $1, updated_at = NOW() WHERE id = $2;`,
      [!currentValue, userId]
    );
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: currentValue ? "admin.user.remove-superadmin" : "admin.user.grant-superadmin",
      detail: { targetUserId: userId },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    if (userId === authResult.userId) {
      return NextResponse.json({ error: "Je kunt je eigen account niet verwijderen." }, { status: 400 });
    }
    await adminDeleteUser(client, schema, userId);
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.user.delete",
      detail: { targetUserId: userId },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
}
