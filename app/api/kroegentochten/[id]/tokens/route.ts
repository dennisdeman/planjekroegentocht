import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg, uniqueStationIdsFromPlan } from "@lib/server/kroegentocht-db";
import {
  listTokensForPlan,
  createLiveToken,
  revokeActiveTokenByRoleAndScope,
  revokeLiveToken,
} from "@lib/server/live-tokens";
import { logActivity } from "@lib/server/db";
import type { LiveRole, ConfigV2 } from "@core";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

function enrichTokenWithLabel(
  token: { role: LiveRole; scopeId: string | null },
  config: ConfigV2 | null
): string {
  if (token.role === "scoreboard") return "Publiek scorebord";
  if (token.role === "program") return "Publiek programma";
  if (token.role === "supervisor" && token.scopeId && config) {
    const station = config.stations.find((s) => s.id === token.scopeId);
    if (station) {
      const location = config.locations.find((l) => l.id === station.locationId);
      const activity = config.activityTypes.find((a) => a.id === station.activityTypeId);
      return `Spelbegeleider — ${activity?.name ?? "Spel"} @ ${location?.name ?? "Veld"}`;
    }
    return `Spelbegeleider — ${token.scopeId}`;
  }
  return token.role;
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

    const tokens = await listTokensForPlan(client, schema, id, { onlyActive: true });
    const config = sd.configSnapshot;

    const key = (role: string, scopeId: string | null) => `${role}|${scopeId ?? ""}`;
    const activeByKey = new Map(tokens.map((t) => [key(t.role, t.scopeId), t]));

    const toSlot = (role: LiveRole, scopeId: string | null) => {
      const active = activeByKey.get(key(role, scopeId));
      return {
        role,
        scopeId,
        label: enrichTokenWithLabel({ role, scopeId }, config),
        activeToken: active
          ? { id: active.id, rawToken: active.rawToken, createdAt: active.createdAt, expiresAt: active.expiresAt, lastUsedAt: active.lastUsedAt, useCount: active.useCount }
          : null,
      };
    };

    const stationIds = uniqueStationIdsFromPlan(sd.planSnapshot);
    const slots = [
      toSlot("program", null),
      toSlot("scoreboard", null),
      ...stationIds.map((sid) => toSlot("supervisor", sid)),
    ];

    return NextResponse.json({ slots });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kon tokens niet laden." },
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
    const role = body.role as LiveRole;
    const scopeId = (body.scopeId as string | null | undefined) ?? null;

    if (!role || !["supervisor", "program", "scoreboard"].includes(role)) {
      return NextResponse.json({ error: "Ongeldige rol." }, { status: 400 });
    }
    if (role === "supervisor" && !scopeId) {
      return NextResponse.json({ error: "Supervisor heeft station scopeId nodig." }, { status: 400 });
    }

    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    if (role === "supervisor" && scopeId) {
      const stationIds = uniqueStationIdsFromPlan(sd.planSnapshot);
      if (!stationIds.includes(scopeId)) {
        return NextResponse.json({ error: "Station komt niet voor in deze kroegentocht." }, { status: 400 });
      }
    }

    await revokeActiveTokenByRoleAndScope(client, schema, id, role, scopeId);
    const token = await createLiveToken(client, schema, { kroegentochtId: id, role, scopeId });
    await logActivity(client, schema, { userId, orgId, action: "kroegentocht_token_regenerated", detail: { kroegentochtId: id, role, scopeId } });

    return NextResponse.json({
      token: { id: token.id, role: token.role, scopeId: token.scopeId, rawToken: token.rawToken, expiresAt: token.expiresAt },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kon token niet genereren." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "goLive");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const url = new URL(request.url);
    const tokenId = url.searchParams.get("tokenId");
    if (!tokenId) return NextResponse.json({ error: "tokenId ontbreekt." }, { status: 400 });

    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const tokens = await listTokensForPlan(client, schema, id);
    if (!tokens.find((t) => t.id === tokenId)) {
      return NextResponse.json({ error: "Token niet gevonden." }, { status: 404 });
    }

    await revokeLiveToken(client, schema, tokenId);
    await logActivity(client, schema, { userId, orgId, action: "kroegentocht_token_revoked", detail: { kroegentochtId: id, tokenId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kon token niet intrekken." },
      { status: 500 }
    );
  }
}
