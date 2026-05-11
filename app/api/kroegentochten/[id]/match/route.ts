import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { logActivity } from "@lib/server/db";
import { logMatchChange } from "@lib/server/match-audit-log";
import type { MatchStatus, MatchCancelReason } from "@core";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
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
    const { matchId, scoreA, scoreB, status, cancelReason, cancelNote } = body as {
      matchId?: string;
      scoreA?: number | null;
      scoreB?: number | null;
      status?: MatchStatus;
      cancelReason?: MatchCancelReason | null;
      cancelNote?: string | null;
    };

    if (!matchId || !status) {
      return NextResponse.json({ error: "matchId en status zijn verplicht." }, { status: 400 });
    }

    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const trimmedNote = typeof cancelNote === "string" ? cancelNote.trim().slice(0, 400) : null;

    const prev = await client.query<{ score_a: number | null; score_b: number | null; status: string }>(
      `SELECT score_a, score_b, status FROM ${schema}.match_results WHERE id = $1 AND kroegentocht_id = $2;`,
      [matchId, id]
    );

    const result = await client.query<{
      id: string; timeslot_index: number; station_id: string;
      group_a_id: string; group_b_id: string | null;
      score_a: number | null; score_b: number | null;
      status: string; cancel_reason: string | null; cancel_note: string | null;
      version: number;
    }>(
      `UPDATE ${schema}.match_results
       SET score_a = $2, score_b = $3, status = $4, cancel_reason = $5, cancel_note = $6,
           version = version + 1, last_updated_at = NOW()
       WHERE id = $1 AND kroegentocht_id = $7
       RETURNING id, timeslot_index, station_id, group_a_id, group_b_id,
                 score_a, score_b, status, cancel_reason, cancel_note, version;`,
      [matchId, scoreA ?? null, scoreB ?? null, status, cancelReason ?? null,
       trimmedNote && trimmedNote.length > 0 ? trimmedNote : null, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Match niet gevonden." }, { status: 404 });
    }

    await logActivity(client, schema, { userId, orgId, action: "kroegentocht_score_corrected", detail: { kroegentochtId: id, matchId, scoreA, scoreB, status } });

    const old = prev.rows[0];
    if (old) {
      await logMatchChange(client, schema, {
        matchId,
        oldScoreA: old.score_a, oldScoreB: old.score_b,
        newScoreA: scoreA ?? null, newScoreB: scoreB ?? null,
        oldStatus: old.status, newStatus: status,
        changedByUserId: userId,
      });
    }

    const r = result.rows[0];
    return NextResponse.json({
      match: {
        id: r.id, timeslotIndex: r.timeslot_index, stationId: r.station_id,
        groupAId: r.group_a_id, groupBId: r.group_b_id,
        scoreA: r.score_a, scoreB: r.score_b,
        status: r.status, cancelReason: r.cancel_reason, cancelNote: r.cancel_note,
        version: r.version,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Score correctie mislukt." },
      { status: 500 }
    );
  }
}
