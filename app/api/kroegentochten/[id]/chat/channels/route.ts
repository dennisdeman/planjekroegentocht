import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { getChannelsForParticipant, buildParticipantKey } from "@lib/server/chat-db";
import { listTokensForPlan } from "@lib/server/live-tokens";

export const runtime = "nodejs";

interface RouteCtx { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const participantKey = "admin";
    const channels = await getChannelsForParticipant(client, schema, id, participantKey);

    const config = sd.configSnapshot;
    const stationLabelMap = new Map<string, string>();
    for (const station of config.stations) {
      const activity = config.activityTypes.find((a) => a.id === station.activityTypeId);
      const location = config.locations.find((l) => l.id === station.locationId);
      stationLabelMap.set(station.id, `${activity?.name ?? station.name} @ ${location?.name ?? "?"}`);
    }

    const tokens = await listTokensForPlan(client, schema, id, { onlyActive: true });
    const participants = tokens
      .filter((t) => t.role === "supervisor")
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
      });

    // Corrigeer DM-labels met participant display-namen
    const participantNameMap = new Map(participants.map((p) => [p.key, p.name]));
    for (const ch of channels) {
      if (ch.channelType === "direct" && ch.channelKey.startsWith("dm:")) {
        const parts = ch.channelKey.replace("dm:", "").split("+");
        const otherKey = parts.find((p) => p !== participantKey) ?? parts[0];
        const displayName = participantNameMap.get(otherKey);
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
