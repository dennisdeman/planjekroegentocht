import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { loadMatchesForKroegentocht } from "@lib/server/live-state";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const config = sd.configSnapshot;
    const matches = await loadMatchesForKroegentocht(client, schema, id);

    const stationStats = new Map<string, {
      stationId: string;
      label: string;
      total: number;
      completed: number;
      cancelled: number;
      pending: number;
      lastActivity: string | null;
    }>();

    for (const station of config.stations) {
      const loc = config.locations.find((l) => l.id === station.locationId);
      const act = config.activityTypes.find((a) => a.id === station.activityTypeId);
      stationStats.set(station.id, {
        stationId: station.id,
        label: `${act?.name ?? "Spel"} @ ${loc?.name ?? "Veld"}`,
        total: 0, completed: 0, cancelled: 0, pending: 0, lastActivity: null,
      });
    }

    for (const m of matches) {
      const stat = stationStats.get(m.stationId);
      if (!stat) continue;
      stat.total += 1;
      if (m.status === "completed") stat.completed += 1;
      else if (m.status === "cancelled") stat.cancelled += 1;
      else stat.pending += 1;
      if (m.enteredAt && (!stat.lastActivity || m.enteredAt > stat.lastActivity)) {
        stat.lastActivity = m.enteredAt;
      }
    }

    const stations = Array.from(stationStats.values()).sort((a, b) => {
      const aP = a.total > 0 ? a.completed / a.total : 0;
      const bP = b.total > 0 ? b.completed / b.total : 0;
      return aP - bP;
    });

    return NextResponse.json({
      totalMatches: matches.length,
      totalCompleted: matches.filter((m) => m.status === "completed").length,
      totalCancelled: matches.filter((m) => m.status === "cancelled").length,
      stations,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Monitor laden mislukt." },
      { status: 500 }
    );
  }
}
