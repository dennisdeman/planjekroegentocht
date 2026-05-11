import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg, updateKroegentochtStatus, shiftConfigTimeslots } from "@lib/server/kroegentocht-db";
import { extendTokenExpiry, revokeAllTokensForPlan } from "@lib/server/live-tokens";
import { logActivity } from "@lib/server/db";
import type { LiveConfig, LiveStatus } from "@core";

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

    let effectiveEndAt: string | null = null;
    if (sd.liveStartedAt && sd.configSnapshot?.timeslots) {
      const activeSlots = sd.configSnapshot.timeslots
        .filter((t) => t.kind === "active")
        .sort((a, b) => a.index - b.index);
      if (activeSlots.length > 0) {
        const firstStart = new Date(activeSlots[0].start).getTime();
        const lastEnd = new Date(activeSlots[activeSlots.length - 1].end).getTime();
        effectiveEndAt = new Date(new Date(sd.liveStartedAt).getTime() + (lastEnd - firstStart) + sd.liveScheduleOffsetSeconds * 1000).toISOString();
      }
    }

    return NextResponse.json({
      status: sd.liveStatus,
      startedAt: sd.liveStartedAt,
      completedAt: sd.liveCompletedAt,
      scheduleOffsetSeconds: sd.liveScheduleOffsetSeconds,
      config: sd.liveConfig,
      effectiveEndAt,
      adminName: sd.adminName,
      photosEnabled: sd.photosEnabled,
      photoAutoApprove: sd.photoAutoApprove,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kon status niet laden." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "goLive");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const body = await request.json();
    const nextStatus = body.status as LiveStatus | undefined;

    if (!nextStatus || !["live", "completed"].includes(nextStatus)) {
      return NextResponse.json({ error: "Ongeldige status." }, { status: 400 });
    }

    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const allowed: Record<LiveStatus, LiveStatus[]> = {
      draft: ["live"],
      live: ["completed"],
      completed: ["live"],
    };
    if (!allowed[sd.liveStatus].includes(nextStatus)) {
      return NextResponse.json(
        { error: `Kan niet van ${sd.liveStatus} naar ${nextStatus}.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (nextStatus === "live") {
      await updateKroegentochtStatus(client, schema, id, {
        status: "live",
        completedAt: null,
      });
      await logActivity(client, schema, { userId, orgId, action: "kroegentocht_reopened", detail: { kroegentochtId: id } });
    } else if (nextStatus === "completed") {
      await updateKroegentochtStatus(client, schema, id, {
        status: "completed",
        completedAt: now,
      });
      await extendTokenExpiry(client, schema, id, 7 * 24);
      await logActivity(client, schema, { userId, orgId, action: "kroegentocht_completed", detail: { kroegentochtId: id } });
    }

    return NextResponse.json({ status: nextStatus });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kon status niet aanpassen." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "goLive");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const body = await request.json();

    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    if (sd.liveStatus !== "live") {
      return NextResponse.json({ error: "Instellingen kunnen alleen aangepast worden als de kroegentocht live of gepland is." }, { status: 400 });
    }

    const input: { startedAt?: string; liveConfig?: LiveConfig } = {};

    if (body.startedAt !== undefined) {
      input.startedAt = new Date(body.startedAt).toISOString();
    }
    if (body.liveConfig !== undefined) {
      input.liveConfig = body.liveConfig;
    }

    if (typeof body.adminName === "string") {
      await client.query(
        `UPDATE ${schema}.kroegentochten SET admin_name = $2 WHERE id = $1;`,
        [id, body.adminName.trim().slice(0, 100) || null]
      );
    }

    if (typeof body.photosEnabled === "boolean") {
      await client.query(`UPDATE ${schema}.kroegentochten SET photos_enabled = $2 WHERE id = $1;`, [id, body.photosEnabled]);
    }
    if (typeof body.photoAutoApprove === "boolean") {
      await client.query(`UPDATE ${schema}.kroegentochten SET photo_auto_approve = $2 WHERE id = $1;`, [id, body.photoAutoApprove]);
    }

    // Als starttijd wijzigt: verschuif timeslots in configSnapshot
    if (input.startedAt) {
      const shiftedConfig = shiftConfigTimeslots(sd.configSnapshot, input.startedAt);
      await client.query(
        `UPDATE ${schema}.kroegentochten SET config_snapshot = $2::jsonb WHERE id = $1;`,
        [id, JSON.stringify(shiftedConfig)]
      );
    }

    if (input.startedAt || input.liveConfig) {
      await updateKroegentochtStatus(client, schema, id, {
        status: "live",
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
        ...(input.liveConfig ? { liveConfig: input.liveConfig } : {}),
      });
    }

    if (input.startedAt || input.liveConfig || body.adminName !== undefined) {
      await logActivity(client, schema, { userId, orgId, action: "kroegentocht_settings_updated", detail: { kroegentochtId: id } });
    }

    const updated = await findKroegentochtForOrg(client, schema, id, orgId);
    return NextResponse.json({
      status: updated!.liveStatus,
      startedAt: updated!.liveStartedAt,
      completedAt: updated!.liveCompletedAt,
      scheduleOffsetSeconds: updated!.liveScheduleOffsetSeconds,
      config: updated!.liveConfig,
      adminName: updated!.adminName,
      photosEnabled: updated!.photosEnabled,
      photoAutoApprove: updated!.photoAutoApprove,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Instellingen opslaan mislukt." },
      { status: 500 }
    );
  }
}
