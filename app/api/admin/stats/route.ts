import { NextResponse } from "next/server";
import { requireSuperadmin } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { adminGetDashboardStats, adminGetRevenueByMonth } from "@lib/server/db";

export async function GET() {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();
  const [stats, revenue] = await Promise.all([
    adminGetDashboardStats(client, schema),
    adminGetRevenueByMonth(client, schema),
  ]);
  return NextResponse.json({ ...stats, revenue });
}
