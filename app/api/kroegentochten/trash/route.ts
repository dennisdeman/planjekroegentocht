import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { hardDeleteAllTrashedForOrg } from "@lib/server/kroegentocht-db";
import { logActivity } from "@lib/server/db";
import { deleteObject } from "@lib/server/r2";

export const runtime = "nodejs";

export async function DELETE() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    // Verwijder foto's uit R2 voordat DB-records cascade-verwijderd worden
    const photos = await client.query<{ file_key: string }>(
      `SELECT p.file_key FROM ${schema}.kroegentocht_photos p
       JOIN ${schema}.kroegentochten s ON s.id = p.kroegentocht_id
       WHERE s.org_id = $1 AND s.deleted_at IS NOT NULL;`,
      [orgId]
    );
    await Promise.all(photos.rows.map((r) => deleteObject(r.file_key).catch(() => {})));

    await hardDeleteAllTrashedForOrg(client, schema, orgId);
    await logActivity(client, schema, { userId, orgId, action: "kroegentocht_trash_emptied", detail: {} });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prullenbak legen mislukt." },
      { status: 500 }
    );
  }
}
