import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { loadMatchesForKroegentocht, computeCursor } from "@lib/server/live-state";
import { listTokensForPlan } from "@lib/server/live-tokens";

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

    const matches = await loadMatchesForKroegentocht(client, schema, id);
    const config = sd.configSnapshot;
    const cursor = computeCursor(config, sd.liveStatus, sd.liveStartedAt, sd.liveScheduleOffsetSeconds);

    const tokens = await listTokensForPlan(client, schema, id, { onlyActive: false });
    const supervisorNames: Record<string, string> = {};
    for (const t of tokens) {
      if (t.supervisorName) supervisorNames[t.id] = t.supervisorName;
    }

    const stationSupervisors: Record<string, string[]> = {};
    try {
      const svRows = await client.query<{ station_id: string; name: string }>(
        `SELECT station_id, name FROM ${schema}.kroegentocht_station_supervisors WHERE kroegentocht_id = $1 ORDER BY registered_at;`,
        [id]
      );
      for (const r of svRows.rows) {
        if (!stationSupervisors[r.station_id]) stationSupervisors[r.station_id] = [];
        stationSupervisors[r.station_id].push(r.name);
      }
    } catch { /* tabel bestaat mogelijk nog niet */ }

    // Fallback 1: token-namen
    for (const t of tokens) {
      if (t.role === "supervisor" && t.scopeId && t.supervisorName) {
        if (!stationSupervisors[t.scopeId]) stationSupervisors[t.scopeId] = [];
        if (!stationSupervisors[t.scopeId].includes(t.supervisorName)) {
          stationSupervisors[t.scopeId].push(t.supervisorName);
        }
      }
    }
    // Fallback 2: namen uit ingevoerde scores
    for (const m of matches) {
      if (m.enteredByName && m.stationId) {
        if (!stationSupervisors[m.stationId]) stationSupervisors[m.stationId] = [];
        if (!stationSupervisors[m.stationId].includes(m.enteredByName)) {
          stationSupervisors[m.stationId].push(m.enteredByName);
        }
      }
    }

    // Per station: status van begeleider (namen / onbekend / nooit geopend)
    const stationSupervisorStatus: Record<string, { status: "names" | "unknown" | "never_opened"; names: string[] }> = {};
    for (const t of tokens) {
      if (t.role === "supervisor" && t.scopeId) {
        const names = stationSupervisors[t.scopeId] ?? [];
        if (names.length > 0) {
          stationSupervisorStatus[t.scopeId] = { status: "names", names };
        } else if (t.useCount > 0) {
          stationSupervisorStatus[t.scopeId] = { status: "unknown", names: [] };
        } else {
          stationSupervisorStatus[t.scopeId] = { status: "never_opened", names: [] };
        }
      }
    }

    return NextResponse.json({
      matches,
      config,
      cursor,
      supervisorNames,
      stationSupervisors,
      stationSupervisorStatus,
      planSnapshot: sd.planSnapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Matches laden mislukt." },
      { status: 500 }
    );
  }
}
