import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";

/**
 * GET /api/payments/coupons-active
 * Retourneert of er actieve (niet-verlopen, niet-opgebruikte) coupons bestaan.
 */
export async function GET() {
  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${schema}.coupons
     WHERE active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR used_count < max_uses);`
  );

  const hasActive = parseInt(result.rows[0]?.count ?? "0", 10) > 0;
  return NextResponse.json({ hasActive });
}
