import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken, checkTokenRateLimit, listTokensForPlan } from "@lib/server/live-tokens";
import { findKroegentochtByIdRaw } from "@lib/server/kroegentocht-db";
import { findOrganizationById } from "@lib/server/db";
import { buildLiveState } from "@lib/server/live-state";
import type { LiveRole, ConfigV2, LiveState } from "@core";
import type { PgClient } from "@storage";

export const runtime = "nodejs";

async function loadProgramItems(client: PgClient, schema: string, kroegentochtId: string) {
  const result = await client.query<{
    id: string; title: string; description: string | null;
    start_time: string; end_time: string | null; icon: string;
  }>(
    `SELECT id, title, description, start_time, end_time, icon
     FROM ${schema}.kroegentocht_program_items WHERE kroegentocht_id = $1
     ORDER BY start_time ASC;`,
    [kroegentochtId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startTime: r.start_time,
    endTime: r.end_time,
    icon: r.icon,
  }));
}

interface RouteCtx {
  params: Promise<{ role: string; token: string }>;
}

function scopeStateForRole(
  state: LiveState,
  config: ConfigV2
): {
  state: LiveState;
  config: Pick<ConfigV2, "id" | "name" | "groups" | "locations" | "activityTypes" | "stations" | "timeslots" | "scheduleSettings">;
} {
  return {
    state,
    config: {
      id: config.id,
      name: config.name,
      groups: config.groups,
      locations: config.locations,
      activityTypes: config.activityTypes,
      stations: config.stations,
      timeslots: config.timeslots,
      scheduleSettings: config.scheduleSettings,
    },
  };
}

export async function GET(_request: Request, context: RouteCtx) {
  try {
    const { role: roleParam, token } = await context.params;
    if (!["supervisor", "program", "scoreboard"].includes(roleParam)) {
      return NextResponse.json({ error: "Onbekende rol." }, { status: 400 });
    }
    const role = roleParam as LiveRole;

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const verified = await verifyLiveToken(client, schema, token);
    if (!verified) {
      return NextResponse.json({ error: "Link is ongeldig of verlopen." }, { status: 401 });
    }
    if (verified.role !== role) {
      return NextResponse.json({ error: "Link hoort niet bij deze view." }, { status: 403 });
    }

    const rl = checkTokenRateLimit(verified.id);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Te veel verzoeken." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } });
    }

    const kroegentocht = await findKroegentochtByIdRaw(client, schema, verified.kroegentochtId);
    if (!kroegentocht) {
      return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });
    }
    if (kroegentocht.liveStatus === "draft") {
      return NextResponse.json({ error: "Deze kroegentocht is niet live." }, { status: 403 });
    }

    const config = kroegentocht.configSnapshot;
    const liveState = await buildLiveState(client, schema, kroegentocht, { seedMatches: true });
    const scoped = scopeStateForRole(liveState, config);

    const allTokens = await listTokensForPlan(client, schema, kroegentocht.id, { onlyActive: true });
    const programTok = allTokens.find((t) => t.role === "program")?.rawToken ?? null;
    const scoreboardTok = allTokens.find((t) => t.role === "scoreboard")?.rawToken ?? null;

    let logoData: string | null = null;
    if (kroegentocht.orgId) {
      const org = await findOrganizationById(client, schema, kroegentocht.orgId);
      logoData = org?.logo_data ?? null;
    }

    return NextResponse.json({
      planName: config.name,
      role,
      scopeId: verified.scopeId,
      tokenId: verified.id,
      state: scoped.state,
      config: scoped.config,
      publicTokens: { program: programTok, scoreboard: scoreboardTok },
      photosEnabled: kroegentocht.photosEnabled,
      programItems: role === "program" ? await loadProgramItems(client, schema, kroegentocht.id) : undefined,
      logoData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kon state niet laden." },
      { status: 500 }
    );
  }
}
