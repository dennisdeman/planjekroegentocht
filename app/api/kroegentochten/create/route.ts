import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findConfigById } from "@lib/server/live-plan-db";
import { createKroegentocht, uniqueStationIdsFromPlan, shiftConfigTimeslots } from "@lib/server/kroegentocht-db";
import { autoGenerateTokensForPlan } from "@lib/server/live-tokens";
import { ensureMatchResultsForKroegentocht } from "@lib/server/live-state";
import { logActivity } from "@lib/server/db";
import type { LiveConfig, PlanV2 } from "@core";
import { DEFAULT_LIVE_CONFIG } from "@core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "goLive");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const body = await request.json();
    const planId = body.planId as string | undefined;
    const liveConfigOverride = body.liveConfig as Partial<LiveConfig> | undefined;
    const startMode = (body.startMode as "scheduled" | "now" | undefined) ?? "now";
    const scheduledDatetime = body.scheduledDatetime as string | undefined;
    const adminName = typeof body.adminName === "string" ? body.adminName.trim().slice(0, 100) || null : null;
    const photosEnabled = body.photosEnabled === true;

    if (!planId) {
      return NextResponse.json({ error: "planId is verplicht." }, { status: 400 });
    }

    const client = getClient();
    const schema = getSchema();

    const plan = await client.query<{
      id: string;
      config_id: string;
      org_id: string | null;
      payload: PlanV2;
    }>(
      `SELECT id, config_id, org_id, payload FROM ${schema}.planner_plans WHERE id = $1 AND org_id = $2;`,
      [planId, orgId]
    );
    const planRow = plan.rows[0];
    if (!planRow) return NextResponse.json({ error: "Plan niet gevonden." }, { status: 404 });

    const config = await findConfigById(client, schema, planRow.config_id);
    if (!config) return NextResponse.json({ error: "Configuratie niet gevonden." }, { status: 404 });

    const mergedConfig: LiveConfig = { ...DEFAULT_LIVE_CONFIG, ...(liveConfigOverride ?? {}) };

    let effectiveStartedAt: string;
    if (startMode === "scheduled" && scheduledDatetime) {
      effectiveStartedAt = new Date(scheduledDatetime).toISOString();
    } else if (startMode === "scheduled") {
      const firstActive = config.timeslots
        .filter((t) => t.kind === "active")
        .sort((a, b) => a.index - b.index)[0];
      if (firstActive) {
        const slotTime = new Date(firstActive.start);
        const today = new Date();
        today.setHours(slotTime.getHours(), slotTime.getMinutes(), slotTime.getSeconds(), 0);
        effectiveStartedAt = today.toISOString();
      } else {
        effectiveStartedAt = new Date().toISOString();
      }
    } else {
      effectiveStartedAt = new Date().toISOString();
    }

    // Guard: als alle rondes al voorbij zouden zijn, start nu
    const activeSlots = config.timeslots.filter((t) => t.kind === "active").sort((a, b) => a.index - b.index);
    if (activeSlots.length > 0) {
      const firstStart = new Date(activeSlots[0].start).getTime();
      const lastEnd = new Date(activeSlots[activeSlots.length - 1].end).getTime();
      const totalDurationMs = lastEnd - firstStart;
      const effectiveEnd = new Date(effectiveStartedAt).getTime() + totalDurationMs;
      if (effectiveEnd < Date.now()) {
        effectiveStartedAt = new Date().toISOString();
      }
    }

    // Verschuif timeslot-tijden naar de daadwerkelijke starttijd
    const shiftedConfig = shiftConfigTimeslots(config, effectiveStartedAt);

    const kroegentochtId = `sd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const kroegentocht = await createKroegentocht(client, schema, {
      id: kroegentochtId,
      orgId,
      name: config.name,
      adminName,
      photosEnabled,
      sourcePlanId: planId,
      configSnapshot: shiftedConfig,
      planSnapshot: planRow.payload,
      liveConfig: mergedConfig,
      startedAt: effectiveStartedAt,
    });

    const stationIds = uniqueStationIdsFromPlan(planRow.payload);
    const tokens = await autoGenerateTokensForPlan(client, schema, kroegentochtId, stationIds);
    await ensureMatchResultsForKroegentocht(client, schema, kroegentochtId, planRow.payload, config);

    await logActivity(client, schema, {
      userId,
      orgId,
      action: "kroegentocht_created",
      detail: { kroegentochtId, planId, name: config.name },
    });

    return NextResponse.json({
      kroegentocht: {
        id: kroegentocht.id,
        name: kroegentocht.name,
        liveStatus: kroegentocht.liveStatus,
      },
      tokens: tokens.map((t) => ({ id: t.id, role: t.role, scopeId: t.scopeId, rawToken: t.rawToken, expiresAt: t.expiresAt })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kroegentocht aanmaken mislukt." },
      { status: 500 }
    );
  }
}
