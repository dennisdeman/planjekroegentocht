import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { listKroegentochtenForOrg, listDeletedKroegentochtenForOrg } from "@lib/server/kroegentocht-db";
import { listTokensForPlan } from "@lib/server/live-tokens";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();
    const kroegentochten = await listKroegentochtenForOrg(client, schema, orgId);

    const items = await Promise.all(
      kroegentochten.map(async (sd) => {
        const tokens = await listTokensForPlan(client, schema, sd.id, { onlyActive: true });
        const programToken = tokens.find((t) => t.role === "program")?.rawToken ?? null;
        const scoreboardToken = tokens.find((t) => t.role === "scoreboard")?.rawToken ?? null;

        let effectiveEndAt: string | null = null;
        if (sd.liveStartedAt && sd.configSnapshot?.timeslots) {
          const activeSlots = sd.configSnapshot.timeslots
            .filter((t) => t.kind === "active")
            .sort((a, b) => a.index - b.index);
          if (activeSlots.length > 0) {
            const firstStart = new Date(activeSlots[0].start).getTime();
            const lastEnd = new Date(activeSlots[activeSlots.length - 1].end).getTime();
            const durationMs = lastEnd - firstStart;
            const offsetMs = sd.liveScheduleOffsetSeconds * 1000;
            effectiveEndAt = new Date(new Date(sd.liveStartedAt).getTime() + durationMs + offsetMs).toISOString();
          }
        }

        return {
          id: sd.id,
          name: sd.name,
          liveStatus: sd.liveStatus,
          liveStartedAt: sd.liveStartedAt,
          liveCompletedAt: sd.liveCompletedAt,
          effectiveEndAt,
          createdAt: sd.createdAt,
          programToken,
          scoreboardToken,
        };
      })
    );

    const deleted = await listDeletedKroegentochtenForOrg(client, schema, orgId);

    return NextResponse.json({ items, deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laden mislukt." },
      { status: 500 }
    );
  }
}
