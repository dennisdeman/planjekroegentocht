import type { PgClient } from "@storage";
import type { LiveStatus, LiveConfig, PlanV2, ConfigV2, TimeslotV2 } from "@core";
import { DEFAULT_LIVE_CONFIG } from "@core";

/**
 * Verschuif alle timeslot-tijden in een config zodat de eerste actieve slot
 * begint op de opgegeven starttijd. De relatieve afstanden tussen slots blijven behouden.
 */
export function shiftConfigTimeslots(config: ConfigV2, actualStartIso: string): ConfigV2 {
  const activeSlots = config.timeslots
    .filter((t) => t.kind === "active")
    .sort((a, b) => a.index - b.index);
  if (activeSlots.length === 0) return config;

  const firstSlotMs = new Date(activeSlots[0].start).getTime();
  // Gebruik LOKALE uren/minuten om de "fake UTC" conventie te behouden
  // (planning slaat 10:00 lokaal op als 2026-01-01T10:00Z)
  const actualStart = new Date(actualStartIso);
  const targetMs = Date.UTC(2026, 0, 1, actualStart.getHours(), actualStart.getMinutes(), 0, 0);
  const offsetMs = targetMs - firstSlotMs;

  if (Math.abs(offsetMs) < 60_000) return config;

  const fmt = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

  const shiftedTimeslots: TimeslotV2[] = config.timeslots.map((t) => {
    const newStart = new Date(new Date(t.start).getTime() + offsetMs);
    const newEnd = new Date(new Date(t.end).getTime() + offsetMs);
    return {
      ...t,
      start: newStart.toISOString(),
      end: newEnd.toISOString(),
      label: `${fmt(newStart)} - ${fmt(newEnd)}`,
    };
  });

  return { ...config, timeslots: shiftedTimeslots };
}

export interface KroegentochtRow {
  id: string;
  orgId: string;
  name: string;
  adminName: string | null;
  sourcePlanId: string | null;
  configSnapshot: ConfigV2;
  planSnapshot: PlanV2;
  liveStatus: LiveStatus;
  liveStartedAt: string | null;
  liveCompletedAt: string | null;
  liveScheduleOffsetSeconds: number;
  liveConfig: LiveConfig;
  photosEnabled: boolean;
  photoAutoApprove: boolean;
  createdAt: string;
}

interface DbRow {
  id: string;
  org_id: string;
  name: string;
  admin_name: string | null;
  source_plan_id: string | null;
  config_snapshot: ConfigV2;
  plan_snapshot: PlanV2;
  live_status: string;
  live_started_at: string | null;
  live_completed_at: string | null;
  live_schedule_offset_seconds: number;
  live_config: Partial<LiveConfig>;
  photos_enabled: boolean;
  photo_auto_approve: boolean;
  created_at: string;
}

function toRow(r: DbRow): KroegentochtRow {
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    adminName: r.admin_name,
    sourcePlanId: r.source_plan_id,
    configSnapshot: r.config_snapshot,
    planSnapshot: r.plan_snapshot,
    liveStatus: r.live_status as LiveStatus,
    liveStartedAt: r.live_started_at,
    liveCompletedAt: r.live_completed_at,
    liveScheduleOffsetSeconds: r.live_schedule_offset_seconds,
    liveConfig: { ...DEFAULT_LIVE_CONFIG, ...(r.live_config ?? {}) },
    photosEnabled: r.photos_enabled ?? false,
    photoAutoApprove: r.photo_auto_approve ?? false,
    createdAt: r.created_at,
  };
}

const SELECT_COLS = `id, org_id, name, admin_name, source_plan_id, config_snapshot, plan_snapshot,
  live_status, live_started_at, live_completed_at,
  live_schedule_offset_seconds, live_config, photos_enabled, photo_auto_approve, created_at`;

export async function findKroegentochtForOrg(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  orgId: string
): Promise<KroegentochtRow | null> {
  const result = await client.query<DbRow>(
    `SELECT ${SELECT_COLS} FROM ${schema}.kroegentochten WHERE id = $1 AND org_id = $2;`,
    [kroegentochtId, orgId]
  );
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function findKroegentochtByIdRaw(
  client: PgClient,
  schema: string,
  kroegentochtId: string
): Promise<KroegentochtRow | null> {
  const result = await client.query<DbRow>(
    `SELECT ${SELECT_COLS} FROM ${schema}.kroegentochten WHERE id = $1;`,
    [kroegentochtId]
  );
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export interface CreateKroegentochtInput {
  id: string;
  orgId: string;
  name: string;
  adminName?: string | null;
  sourcePlanId: string | null;
  configSnapshot: ConfigV2;
  planSnapshot: PlanV2;
  liveConfig: LiveConfig;
  startedAt: string;
  photosEnabled?: boolean;
}

export async function createKroegentocht(
  client: PgClient,
  schema: string,
  input: CreateKroegentochtInput
): Promise<KroegentochtRow> {
  const result = await client.query<DbRow>(
    `INSERT INTO ${schema}.kroegentochten
       (id, org_id, name, admin_name, source_plan_id, config_snapshot, plan_snapshot,
        live_status, live_started_at, live_config, photos_enabled)
     VALUES ($1, $2, $3, $9, $4, $5::jsonb, $6::jsonb, 'live', $7, $8::jsonb, $10)
     RETURNING ${SELECT_COLS};`,
    [
      input.id,
      input.orgId,
      input.name,
      input.sourcePlanId,
      JSON.stringify(input.configSnapshot),
      JSON.stringify(input.planSnapshot),
      input.startedAt,
      JSON.stringify(input.liveConfig),
      input.adminName ?? null,
      input.photosEnabled ?? false,
    ]
  );
  return toRow(result.rows[0]);
}

export interface UpdateKroegentochtStatusInput {
  status: LiveStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  scheduleOffsetSeconds?: number;
  liveConfig?: LiveConfig;
}

export async function updateKroegentochtStatus(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  input: UpdateKroegentochtStatusInput
): Promise<void> {
  const fields: string[] = ["live_status = $2"];
  const values: Array<string | number | null> = [kroegentochtId, input.status];
  let i = 3;
  if (input.startedAt !== undefined) { fields.push(`live_started_at = $${i++}`); values.push(input.startedAt); }
  if (input.completedAt !== undefined) { fields.push(`live_completed_at = $${i++}`); values.push(input.completedAt); }
  if (input.scheduleOffsetSeconds !== undefined) { fields.push(`live_schedule_offset_seconds = $${i++}`); values.push(input.scheduleOffsetSeconds); }
  if (input.liveConfig !== undefined) { fields.push(`live_config = $${i++}::jsonb`); values.push(JSON.stringify(input.liveConfig)); }
  await client.query(
    `UPDATE ${schema}.kroegentochten SET ${fields.join(", ")} WHERE id = $1;`,
    values
  );
}

export async function updateKroegentochtScheduleOffset(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  deltaSeconds: number
): Promise<number> {
  const result = await client.query<{ live_schedule_offset_seconds: number }>(
    `UPDATE ${schema}.kroegentochten
     SET live_schedule_offset_seconds = live_schedule_offset_seconds + $2
     WHERE id = $1
     RETURNING live_schedule_offset_seconds;`,
    [kroegentochtId, deltaSeconds]
  );
  return result.rows[0]?.live_schedule_offset_seconds ?? 0;
}

export async function listKroegentochtenForOrg(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<KroegentochtRow[]> {
  const result = await client.query<DbRow>(
    `SELECT ${SELECT_COLS} FROM ${schema}.kroegentochten
     WHERE org_id = $1 AND deleted_at IS NULL
     ORDER BY CASE live_status WHEN 'live' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
              created_at DESC;`,
    [orgId]
  );
  return result.rows.map(toRow);
}

export interface DeletedKroegentochtRow {
  id: string;
  name: string;
  deletedAt: string;
  liveCompletedAt: string | null;
}

export async function listDeletedKroegentochtenForOrg(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<DeletedKroegentochtRow[]> {
  const result = await client.query<{
    id: string;
    name: string;
    deleted_at: string;
    live_completed_at: string | null;
  }>(
    `SELECT id, name, deleted_at, live_completed_at FROM ${schema}.kroegentochten
     WHERE org_id = $1 AND deleted_at IS NOT NULL
     ORDER BY deleted_at DESC;`,
    [orgId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    deletedAt: r.deleted_at,
    liveCompletedAt: r.live_completed_at,
  }));
}

export async function softDeleteKroegentocht(
  client: PgClient,
  schema: string,
  kroegentochtId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.kroegentochten SET deleted_at = NOW() WHERE id = $1;`,
    [kroegentochtId]
  );
}

export async function restoreKroegentocht(
  client: PgClient,
  schema: string,
  kroegentochtId: string
): Promise<void> {
  await client.query(
    `UPDATE ${schema}.kroegentochten SET deleted_at = NULL WHERE id = $1;`,
    [kroegentochtId]
  );
}

export async function hardDeleteExpiredKroegentochten(
  client: PgClient,
  schema: string
): Promise<void> {
  await client.query(
    `DELETE FROM ${schema}.kroegentochten
     WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';`
  );
}

export async function hardDeleteKroegentocht(
  client: PgClient,
  schema: string,
  kroegentochtId: string
): Promise<void> {
  await client.query(
    `DELETE FROM ${schema}.kroegentochten WHERE id = $1 AND deleted_at IS NOT NULL;`,
    [kroegentochtId]
  );
}

export async function hardDeleteAllTrashedForOrg(
  client: PgClient,
  schema: string,
  orgId: string
): Promise<void> {
  await client.query(
    `DELETE FROM ${schema}.kroegentochten WHERE org_id = $1 AND deleted_at IS NOT NULL;`,
    [orgId]
  );
}

export function uniqueStationIdsFromPlan(plan: PlanV2): string[] {
  const set = new Set<string>();
  for (const a of plan.allocations) set.add(a.stationId);
  return Array.from(set);
}
