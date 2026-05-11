import type { PgClient } from "@storage";
import type { LiveStatus, LiveConfig, PlanV2, ConfigV2 } from "@core";
import { DEFAULT_LIVE_CONFIG } from "@core";

export interface LivePlanRow {
  id: string;
  configId: string;
  orgId: string | null;
  payload: PlanV2;
  liveStatus: LiveStatus;
  liveStartedAt: string | null;
  liveCompletedAt: string | null;
  liveScheduleOffsetSeconds: number;
  liveConfig: LiveConfig;
}

export async function findLivePlanForOrg(
  client: PgClient,
  schema: string,
  planId: string,
  orgId: string
): Promise<LivePlanRow | null> {
  const result = await client.query<{
    id: string;
    config_id: string;
    org_id: string | null;
    payload: PlanV2;
    live_status: string;
    live_started_at: string | null;
    live_completed_at: string | null;
    live_schedule_offset_seconds: number;
    live_config: Partial<LiveConfig>;
  }>(
    `SELECT id, config_id, org_id, payload,
            live_status, live_started_at, live_completed_at,
            live_schedule_offset_seconds, live_config
     FROM ${schema}.planner_plans
     WHERE id = $1 AND org_id = $2;`,
    [planId, orgId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    configId: row.config_id,
    orgId: row.org_id,
    payload: row.payload,
    liveStatus: row.live_status as LiveStatus,
    liveStartedAt: row.live_started_at,
    liveCompletedAt: row.live_completed_at,
    liveScheduleOffsetSeconds: row.live_schedule_offset_seconds,
    liveConfig: { ...DEFAULT_LIVE_CONFIG, ...(row.live_config ?? {}) },
  };
}

export async function findLivePlanByIdRaw(
  client: PgClient,
  schema: string,
  planId: string
): Promise<LivePlanRow | null> {
  const result = await client.query<{
    id: string;
    config_id: string;
    org_id: string | null;
    payload: PlanV2;
    live_status: string;
    live_started_at: string | null;
    live_completed_at: string | null;
    live_schedule_offset_seconds: number;
    live_config: Partial<LiveConfig>;
  }>(
    `SELECT id, config_id, org_id, payload,
            live_status, live_started_at, live_completed_at,
            live_schedule_offset_seconds, live_config
     FROM ${schema}.planner_plans
     WHERE id = $1;`,
    [planId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    configId: row.config_id,
    orgId: row.org_id,
    payload: row.payload,
    liveStatus: row.live_status as LiveStatus,
    liveStartedAt: row.live_started_at,
    liveCompletedAt: row.live_completed_at,
    liveScheduleOffsetSeconds: row.live_schedule_offset_seconds,
    liveConfig: { ...DEFAULT_LIVE_CONFIG, ...(row.live_config ?? {}) },
  };
}

export async function findConfigById(
  client: PgClient,
  schema: string,
  configId: string
): Promise<ConfigV2 | null> {
  const result = await client.query<{ payload: ConfigV2 }>(
    `SELECT payload FROM ${schema}.planner_configs WHERE id = $1;`,
    [configId]
  );
  return result.rows[0]?.payload ?? null;
}

export interface UpdateLiveStatusInput {
  status: LiveStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  scheduleOffsetSeconds?: number;
  liveConfig?: LiveConfig;
}

export async function updateLivePlanStatus(
  client: PgClient,
  schema: string,
  planId: string,
  input: UpdateLiveStatusInput
): Promise<void> {
  const fields: string[] = ["live_status = $2"];
  const values: Array<string | number | null> = [planId, input.status];
  let i = 3;
  if (input.startedAt !== undefined) { fields.push(`live_started_at = $${i++}`); values.push(input.startedAt); }
  if (input.completedAt !== undefined) { fields.push(`live_completed_at = $${i++}`); values.push(input.completedAt); }
  if (input.scheduleOffsetSeconds !== undefined) { fields.push(`live_schedule_offset_seconds = $${i++}`); values.push(input.scheduleOffsetSeconds); }
  if (input.liveConfig !== undefined) { fields.push(`live_config = $${i++}::jsonb`); values.push(JSON.stringify(input.liveConfig)); }

  await client.query(
    `UPDATE ${schema}.planner_plans SET ${fields.join(", ")} WHERE id = $1;`,
    values
  );
}

export async function updateLiveScheduleOffset(
  client: PgClient,
  schema: string,
  planId: string,
  deltaSeconds: number
): Promise<number> {
  const result = await client.query<{ live_schedule_offset_seconds: number }>(
    `UPDATE ${schema}.planner_plans
     SET live_schedule_offset_seconds = live_schedule_offset_seconds + $2
     WHERE id = $1
     RETURNING live_schedule_offset_seconds;`,
    [planId, deltaSeconds]
  );
  return result.rows[0]?.live_schedule_offset_seconds ?? 0;
}

export function uniqueStationIdsFromPlan(plan: PlanV2): string[] {
  const set = new Set<string>();
  for (const a of plan.allocations) {
    set.add(a.stationId);
  }
  return Array.from(set);
}
