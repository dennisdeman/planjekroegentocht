import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken, checkTokenRateLimit, listTokensForPlan } from "@lib/server/live-tokens";
import { findKroegentochtByIdRaw } from "@lib/server/kroegentocht-db";
import { getChannelsForParticipant, buildParticipantKey } from "@lib/server/chat-db";

export const runtime = "nodejs";

interface RouteCtx { params: Promise<{ token: string }> }

export async function GET(_request: Request, context: RouteCtx) {
  try {
    const { token } = await context.params;
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const verified = await verifyLiveToken(client, schema, token);
    if (!verified || verified.role !== "supervisor") {
      return NextResponse.json({ error: "Link is ongeldig of verlopen." }, { status: 401 });
    }

    const rl = checkTokenRateLimit(verified.id);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Te veel verzoeken." }, { status: 429 });
    }

    const participantKey = buildParticipantKey("supervisor", verified.id);
    const channels = await getChannelsForParticipant(client, schema, verified.kroegentochtId, participantKey);

    const kroegentocht = await findKroegentochtByIdRaw(client, schema, verified.kroegentochtId);
    const config = kroegentocht?.configSnapshot;
    const stationLabelMap = new Map<string, string>();
    if (config) {
      for (const station of config.stations) {
        const activity = config.activityTypes.find((a) => a.id === station.activityTypeId);
        const location = config.locations.find((l) => l.id === station.locationId);
        stationLabelMap.set(station.id, `${activity?.name ?? station.name} @ ${location?.name ?? "?"}`);
      }
    }

    const adminName = kroegentocht?.adminName || "Beheerder";
    const tokens = await listTokensForPlan(client, schema, verified.kroegentochtId, { onlyActive: true });
    const participants = [
      { key: "admin", name: `${adminName} — Organisatie`, scopeId: null, stationLabel: null },
      ...tokens
        .filter((t) => t.role === "supervisor" && t.id !== verified.id)
        .map((t) => {
          const stationLabel = t.scopeId ? stationLabelMap.get(t.scopeId) ?? null : null;
          const displayName = t.supervisorName
            ? `${t.supervisorName} — ${stationLabel ?? "Spelbegeleider"}`
            : stationLabel ?? "Spelbegeleider";
          return {
            key: buildParticipantKey("supervisor", t.id),
            name: displayName,
            scopeId: t.scopeId,
            stationLabel,
          };
        }),
    ];

    // Corrigeer DM-labels met participant display-namen
    const participantNameMap = new Map(participants.map((p) => [p.key, p.name]));
    for (const ch of channels) {
      if (ch.channelType === "direct" && ch.channelKey.startsWith("dm:")) {
        const parts = ch.channelKey.replace("dm:", "").split("+");
        const otherKey = parts.find((p) => p !== participantKey) ?? parts[0];
        const displayName = participantNameMap.get(otherKey)
          ?? (otherKey.startsWith("admin:") ? `${adminName} — Organisatie` : undefined);
        if (displayName) {
          ch.label = displayName;
          ch.participantName = displayName;
        }
      }
    }

    return NextResponse.json({ channels, participants });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kanalen laden mislukt." }, { status: 500 });
  }
}
