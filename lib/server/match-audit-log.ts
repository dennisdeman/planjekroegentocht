import type { PgClient } from "@storage";

export interface LogMatchChangeInput {
  matchId: string;
  oldScoreA: number | null;
  oldScoreB: number | null;
  newScoreA: number | null;
  newScoreB: number | null;
  oldStatus: string;
  newStatus: string;
  changedByTokenId?: string | null;
  changedByUserId?: string | null;
  changedByName?: string | null;
}

export interface MatchLogEntry {
  id: string;
  matchId: string;
  oldScoreA: number | null;
  oldScoreB: number | null;
  newScoreA: number | null;
  newScoreB: number | null;
  oldStatus: string;
  newStatus: string;
  changedByTokenId: string | null;
  changedByUserId: string | null;
  changedByName: string | null;
  changedAt: string;
}

export async function logMatchChange(
  client: PgClient,
  schema: string,
  input: LogMatchChangeInput
): Promise<void> {
  await client.query(
    `INSERT INTO ${schema}.match_result_log
       (match_id, old_score_a, old_score_b, new_score_a, new_score_b,
        old_status, new_status, changed_by_token_id, changed_by_user_id, changed_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
    [
      input.matchId,
      input.oldScoreA, input.oldScoreB,
      input.newScoreA, input.newScoreB,
      input.oldStatus, input.newStatus,
      input.changedByTokenId ?? null,
      input.changedByUserId ?? null,
      input.changedByName ?? null,
    ]
  );
}

export async function getMatchHistory(
  client: PgClient,
  schema: string,
  matchId: string
): Promise<MatchLogEntry[]> {
  const result = await client.query<{
    id: string;
    match_id: string;
    old_score_a: number | null;
    old_score_b: number | null;
    new_score_a: number | null;
    new_score_b: number | null;
    old_status: string;
    new_status: string;
    changed_by_token_id: string | null;
    changed_by_user_id: string | null;
    changed_by_name: string | null;
    changed_at: string;
  }>(
    `SELECT id, match_id, old_score_a, old_score_b, new_score_a, new_score_b,
            old_status, new_status, changed_by_token_id, changed_by_user_id, changed_by_name, changed_at
     FROM ${schema}.match_result_log
     WHERE match_id = $1
     ORDER BY changed_at ASC;`,
    [matchId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    matchId: r.match_id,
    oldScoreA: r.old_score_a,
    oldScoreB: r.old_score_b,
    newScoreA: r.new_score_a,
    newScoreB: r.new_score_b,
    oldStatus: r.old_status,
    newStatus: r.new_status,
    changedByTokenId: r.changed_by_token_id,
    changedByUserId: r.changed_by_user_id,
    changedByName: r.changed_by_name,
    changedAt: r.changed_at,
  }));
}
