import type { PgClient } from "@storage";
import type {
  ConfigV2,
  LiveConfig,
  LiveCursor,
  LivePhase,
  LiveState,
  LiveStatus,
  MatchResult,
  MatchStatus,
  PlanV2,
} from "@core";
import { computeLeaderboard } from "@core";
import type { KroegentochtRow } from "./kroegentocht-db";

export function computeCursor(
  config: ConfigV2,
  status: LiveStatus,
  startedAtIso: string | null,
  scheduleOffsetSeconds: number
): LiveCursor {
  const activeTimeslots = config.timeslots
    .filter((t) => t.kind === "active")
    .sort((a, b) => a.index - b.index);

  if (status !== "live" || !startedAtIso || activeTimeslots.length === 0) {
    return {
      phase: "not_live",
      currentTimeslotIndex: null,
      roundStartsAt: null,
      roundEndsAt: null,
      nextTimeslotIndex: null,
      nextRoundStartsAt: null,
      delaySeconds: 0,
    };
  }

  const startedAt = new Date(startedAtIso);
  const firstSlotStart = new Date(activeTimeslots[0].start).getTime();
  const offsetMs = scheduleOffsetSeconds * 1000;

  const slotsWithEffective = activeTimeslots.map((t) => {
    const relStart = new Date(t.start).getTime() - firstSlotStart;
    const relEnd = new Date(t.end).getTime() - firstSlotStart;
    return {
      slot: t,
      effectiveStartMs: startedAt.getTime() + relStart + offsetMs,
      effectiveEndMs: startedAt.getTime() + relEnd + offsetMs,
    };
  });

  const nowMs = Date.now();

  const active = slotsWithEffective.find((s) => nowMs >= s.effectiveStartMs && nowMs < s.effectiveEndMs);
  if (active) {
    return {
      phase: "in_round",
      currentTimeslotIndex: active.slot.index,
      roundStartsAt: new Date(active.effectiveStartMs).toISOString(),
      roundEndsAt: new Date(active.effectiveEndMs).toISOString(),
      nextTimeslotIndex: null,
      nextRoundStartsAt: null,
      delaySeconds: scheduleOffsetSeconds,
    };
  }

  const first = slotsWithEffective[0];
  if (nowMs < first.effectiveStartMs) {
    return {
      phase: "before_first",
      currentTimeslotIndex: null,
      roundStartsAt: null,
      roundEndsAt: null,
      nextTimeslotIndex: first.slot.index,
      nextRoundStartsAt: new Date(first.effectiveStartMs).toISOString(),
      delaySeconds: scheduleOffsetSeconds,
    };
  }

  const upcoming = slotsWithEffective.find((s) => nowMs < s.effectiveStartMs);
  if (upcoming) {
    return {
      phase: "transition",
      currentTimeslotIndex: null,
      roundStartsAt: null,
      roundEndsAt: null,
      nextTimeslotIndex: upcoming.slot.index,
      nextRoundStartsAt: new Date(upcoming.effectiveStartMs).toISOString(),
      delaySeconds: scheduleOffsetSeconds,
    };
  }

  return {
    phase: "after_last",
    currentTimeslotIndex: null,
    roundStartsAt: null,
    roundEndsAt: null,
    nextTimeslotIndex: null,
    nextRoundStartsAt: null,
    delaySeconds: scheduleOffsetSeconds,
  };
}

export async function loadMatchesForKroegentocht(
  client: PgClient,
  schema: string,
  kroegentochtId: string
): Promise<MatchResult[]> {
  const res = await client.query<{
    id: string;
    kroegentocht_id: string;
    timeslot_index: number;
    station_id: string;
    group_a_id: string;
    group_b_id: string | null;
    score_a: number | null;
    score_b: number | null;
    status: string;
    cancel_reason: string | null;
    cancel_note: string | null;
    version: number;
    entered_by_token_id: string | null;
    entered_by_name: string | null;
    entered_at: string | null;
    last_updated_at: string;
  }>(
    `SELECT id, kroegentocht_id, timeslot_index, station_id, group_a_id, group_b_id,
            score_a, score_b, status, cancel_reason, cancel_note, version,
            entered_by_token_id, entered_by_name, entered_at, last_updated_at
     FROM ${schema}.match_results
     WHERE kroegentocht_id = $1;`,
    [kroegentochtId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    kroegentochtId: r.kroegentocht_id,
    timeslotIndex: r.timeslot_index,
    stationId: r.station_id,
    groupAId: r.group_a_id,
    groupBId: r.group_b_id,
    scoreA: r.score_a,
    scoreB: r.score_b,
    status: r.status as MatchStatus,
    cancelReason: r.cancel_reason as MatchResult["cancelReason"],
    cancelNote: r.cancel_note,
    version: r.version,
    enteredByTokenId: r.entered_by_token_id,
    enteredByName: r.entered_by_name,
    enteredAt: r.entered_at,
    lastUpdatedAt: r.last_updated_at,
  }));
}

export async function ensureMatchResultsForKroegentocht(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  plan: PlanV2,
  config: ConfigV2
): Promise<void> {
  const slotByIndex = new Map(config.timeslots.map((t) => [t.id, t.index]));
  for (const alloc of plan.allocations) {
    const tsIndex = slotByIndex.get(alloc.timeslotId);
    if (tsIndex === undefined) continue;
    const [gA, gB] = alloc.groupIds;
    if (!gA) continue;

    await client.query(
      `INSERT INTO ${schema}.match_results (kroegentocht_id, timeslot_index, station_id, group_a_id, group_b_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (kroegentocht_id, timeslot_index, station_id, group_a_id)
       WHERE kroegentocht_id IS NOT NULL
       DO NOTHING;`,
      [kroegentochtId, tsIndex, alloc.stationId, gA, gB ?? null]
    );
  }
}

export async function buildLiveState(
  client: PgClient,
  schema: string,
  kroegentocht: KroegentochtRow,
  options: { seedMatches?: boolean } = {}
): Promise<LiveState> {
  if (options.seedMatches) {
    await ensureMatchResultsForKroegentocht(client, schema, kroegentocht.id, kroegentocht.planSnapshot, kroegentocht.configSnapshot);
  }

  const matches = await loadMatchesForKroegentocht(client, schema, kroegentocht.id);
  const cursor = computeCursor(kroegentocht.configSnapshot, kroegentocht.liveStatus, kroegentocht.liveStartedAt, kroegentocht.liveScheduleOffsetSeconds);
  const leaderboard = computeLeaderboard(kroegentocht.configSnapshot, matches, kroegentocht.liveConfig);

  return {
    kroegentochtId: kroegentocht.id,
    status: kroegentocht.liveStatus,
    startedAt: kroegentocht.liveStartedAt,
    completedAt: kroegentocht.liveCompletedAt,
    scheduleOffsetSeconds: kroegentocht.liveScheduleOffsetSeconds,
    config: kroegentocht.liveConfig,
    cursor,
    matches,
    leaderboard,
  };
}
