import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken, checkTokenRateLimit } from "@lib/server/live-tokens";
import { logMatchChange } from "@lib/server/match-audit-log";
import type { MatchCancelReason, MatchStatus } from "@core";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

const VALID_STATUS: MatchStatus[] = ["scheduled", "in_progress", "completed", "cancelled"];
const VALID_CANCEL: MatchCancelReason[] = ["weather", "no_show", "injury", "other"];

export async function PATCH(request: Request, context: RouteCtx) {
  try {
    const { token } = await context.params;
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const verified = await verifyLiveToken(client, schema, token);
    if (!verified) {
      return NextResponse.json({ error: "Link is ongeldig of verlopen." }, { status: 401 });
    }
    if (verified.role !== "supervisor") {
      return NextResponse.json({ error: "Alleen spelbegeleiders kunnen scores invoeren." }, { status: 403 });
    }

    const rl = checkTokenRateLimit(verified.id);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Te veel verzoeken." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } });
    }

    const body = await request.json();
    const { timeslotIndex, stationId, groupAId, scoreA, scoreB, status, cancelReason, cancelNote, version, enteredByName } = body as {
      timeslotIndex?: number;
      stationId?: string;
      groupAId?: string;
      scoreA?: number | null;
      scoreB?: number | null;
      status?: MatchStatus;
      cancelReason?: MatchCancelReason | null;
      cancelNote?: string | null;
      version?: number;
      enteredByName?: string;
    };

    if (
      typeof timeslotIndex !== "number" ||
      !stationId ||
      !groupAId ||
      !status ||
      !VALID_STATUS.includes(status) ||
      typeof version !== "number"
    ) {
      return NextResponse.json({ error: "Onvolledige of ongeldige input." }, { status: 400 });
    }

    if (cancelReason && !VALID_CANCEL.includes(cancelReason)) {
      return NextResponse.json({ error: "Ongeldige annuleringsreden." }, { status: 400 });
    }

    if (verified.scopeId && verified.scopeId !== stationId) {
      return NextResponse.json({ error: "Dit token is niet voor dit station." }, { status: 403 });
    }

    const trimmedNote = typeof cancelNote === "string" ? cancelNote.trim().slice(0, 400) : null;

    const prev = await client.query<{ id: string; score_a: number | null; score_b: number | null; status: string }>(
      `SELECT id, score_a, score_b, status FROM ${schema}.match_results
       WHERE kroegentocht_id = $1 AND timeslot_index = $2 AND station_id = $3 AND group_a_id = $4;`,
      [verified.kroegentochtId, timeslotIndex, stationId, groupAId]
    );

    const update = await client.query<{
      id: string; timeslot_index: number; station_id: string;
      group_a_id: string; group_b_id: string | null;
      score_a: number | null; score_b: number | null;
      status: string; cancel_reason: string | null; cancel_note: string | null;
      version: number; last_updated_at: string;
    }>(
      `UPDATE ${schema}.match_results
       SET score_a = $5, score_b = $6, status = $7, cancel_reason = $8, cancel_note = $9,
           version = version + 1, entered_by_token_id = $10, entered_by_name = $12,
           entered_at = NOW(), last_updated_at = NOW()
       WHERE kroegentocht_id = $1 AND timeslot_index = $2 AND station_id = $3 AND group_a_id = $4
         AND version = $11
       RETURNING id, timeslot_index, station_id, group_a_id, group_b_id,
                 score_a, score_b, status, cancel_reason, cancel_note, version, last_updated_at;`,
      [
        verified.kroegentochtId,
        timeslotIndex,
        stationId,
        groupAId,
        scoreA ?? null,
        scoreB ?? null,
        status,
        cancelReason ?? null,
        trimmedNote && trimmedNote.length > 0 ? trimmedNote : null,
        verified.id,
        version,
        typeof enteredByName === "string" ? enteredByName.trim().slice(0, 100) || null : null,
      ]
    );

    if (update.rows.length === 0) {
      const current = await client.query<{
        id: string; timeslot_index: number; station_id: string;
        group_a_id: string; group_b_id: string | null;
        score_a: number | null; score_b: number | null;
        status: string; cancel_reason: string | null; cancel_note: string | null;
        version: number; last_updated_at: string;
      }>(
        `SELECT id, timeslot_index, station_id, group_a_id, group_b_id,
                score_a, score_b, status, cancel_reason, cancel_note, version, last_updated_at
         FROM ${schema}.match_results
         WHERE kroegentocht_id = $1 AND timeslot_index = $2 AND station_id = $3 AND group_a_id = $4;`,
        [verified.kroegentochtId, timeslotIndex, stationId, groupAId]
      );
      const c = current.rows[0];
      return NextResponse.json(
        {
          error: "Iemand anders heeft deze spelletje net bijgewerkt. Controleer de huidige score.",
          current: c
            ? {
                timeslotIndex: c.timeslot_index, stationId: c.station_id,
                groupAId: c.group_a_id, groupBId: c.group_b_id,
                scoreA: c.score_a, scoreB: c.score_b,
                status: c.status, cancelReason: c.cancel_reason, cancelNote: c.cancel_note,
                version: c.version,
              }
            : null,
        },
        { status: 409 }
      );
    }

    const trimmedEnteredName = typeof enteredByName === "string" ? enteredByName.trim().slice(0, 100) || null : null;
    if (trimmedEnteredName && verified.scopeId) {
      await client.query(
        `INSERT INTO ${schema}.kroegentocht_station_supervisors (kroegentocht_id, station_id, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (kroegentocht_id, station_id, name) DO NOTHING;`,
        [verified.kroegentochtId, verified.scopeId, trimmedEnteredName]
      ).catch(() => {});
    }

    const r = update.rows[0];
    const old = prev.rows[0];
    if (old) {
      await logMatchChange(client, schema, {
        matchId: old.id,
        oldScoreA: old.score_a, oldScoreB: old.score_b,
        newScoreA: scoreA ?? null, newScoreB: scoreB ?? null,
        oldStatus: old.status, newStatus: status,
        changedByTokenId: verified.id,
        changedByName: typeof enteredByName === "string" ? enteredByName.trim().slice(0, 100) || null : null,
      });
    }

    return NextResponse.json({
      match: {
        timeslotIndex: r.timeslot_index, stationId: r.station_id,
        groupAId: r.group_a_id, groupBId: r.group_b_id,
        scoreA: r.score_a, scoreB: r.score_b,
        status: r.status, cancelReason: r.cancel_reason, cancelNote: r.cancel_note,
        version: r.version, lastUpdatedAt: r.last_updated_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kon score niet opslaan." },
      { status: 500 }
    );
  }
}
