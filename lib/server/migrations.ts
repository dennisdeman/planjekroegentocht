import type { PgClient } from "@storage";
import type { ConfigV2 } from "@core";

/**
 * Ordered list of migration statements.
 * Each entry runs once; `ensureSchema` is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */
const migrations = [
  // ── existing planner tables (unchanged) ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.planner_configs (
    id TEXT PRIMARY KEY,
    updated_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS {schema}.planner_plans (
    id TEXT PRIMARY KEY,
    config_id TEXT NOT NULL REFERENCES {schema}.planner_configs(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL
  );`,

  `CREATE INDEX IF NOT EXISTS idx_planner_plans_config_id
   ON {schema}.planner_plans(config_id);`,

  // ── multi-tenant: users ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── multi-tenant: organizations ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── multi-tenant: memberships ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES {schema}.users(id) ON DELETE CASCADE,
    org_id TEXT NOT NULL REFERENCES {schema}.organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, org_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_memberships_user_id
   ON {schema}.memberships(user_id);`,

  `CREATE INDEX IF NOT EXISTS idx_memberships_org_id
   ON {schema}.memberships(org_id);`,

  // ── multi-tenant: invitations ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.invitations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES {schema}.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by TEXT NOT NULL REFERENCES {schema}.users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_invitations_token
   ON {schema}.invitations(token);`,

  `CREATE INDEX IF NOT EXISTS idx_invitations_org_id
   ON {schema}.invitations(org_id);`,

  // ── add org_id to planner tables ─────────────────────────────────────
  `ALTER TABLE {schema}.planner_configs
   ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES {schema}.organizations(id);`,

  `ALTER TABLE {schema}.planner_plans
   ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES {schema}.organizations(id);`,

  `CREATE INDEX IF NOT EXISTS idx_planner_configs_org_id
   ON {schema}.planner_configs(org_id);`,

  `CREATE INDEX IF NOT EXISTS idx_planner_plans_org_id
   ON {schema}.planner_plans(org_id);`,

  // ── email verification ───────────────────────────────────────────────
  `ALTER TABLE {schema}.users
   ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;`,

  `CREATE TABLE IF NOT EXISTS {schema}.email_verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES {schema}.users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token
   ON {schema}.email_verification_tokens(token);`,

  // ── password reset tokens ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES {schema}.users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
   ON {schema}.password_reset_tokens(token);`,

  // ── config templates (sjablonen) ─────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.config_templates (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES {schema}.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_by TEXT NOT NULL REFERENCES {schema}.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_config_templates_org_id
   ON {schema}.config_templates(org_id);`,

  // ── superadmin flag ─────────────────────────────────────────────────
  `ALTER TABLE {schema}.users
   ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE;`,

  // ── activity log ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES {schema}.users(id) ON DELETE SET NULL,
    org_id TEXT REFERENCES {schema}.organizations(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
   ON {schema}.activity_log(created_at DESC);`,

  `CREATE INDEX IF NOT EXISTS idx_activity_log_user_id
   ON {schema}.activity_log(user_id);`,

  // ── subscription / plan fields on organizations ─────────────────────
  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS active_plan TEXT NOT NULL DEFAULT 'free';`,

  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;`,

  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;`,

  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS plan_frozen BOOLEAN NOT NULL DEFAULT FALSE;`,

  // ── payment history ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.payments (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES {schema}.organizations(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    provider_ref TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_payments_org_id
   ON {schema}.payments(org_id);`,

  // ── logo upload op organisaties ─────────────────────────────────────
  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS logo_data TEXT;`,

  // ── coupons tabel ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.coupons (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    discount_cents INTEGER NOT NULL,
    description TEXT,
    valid_for_plan TEXT,
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── coupon referentie op payments ──────────────────────────────────
  `ALTER TABLE {schema}.payments
   ADD COLUMN IF NOT EXISTS coupon_id TEXT REFERENCES {schema}.coupons(id);`,

  // ── facturatiegegevens op organisaties ───────────────────────────────
  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'private';`,
  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS billing_company_name TEXT;`,
  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS billing_address TEXT;`,
  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS billing_postal_code TEXT;`,
  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS billing_city TEXT;`,
  `ALTER TABLE {schema}.organizations
   ADD COLUMN IF NOT EXISTS billing_vat_number TEXT;`,

  // ── facturen tabel ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    payment_id TEXT REFERENCES {schema}.payments(id),
    org_id TEXT NOT NULL REFERENCES {schema}.organizations(id) ON DELETE CASCADE,
    billing_type TEXT NOT NULL DEFAULT 'private',
    billing_name TEXT NOT NULL,
    billing_email TEXT NOT NULL,
    billing_company_name TEXT,
    billing_address TEXT,
    billing_postal_code TEXT,
    billing_city TEXT,
    billing_vat_number TEXT,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    vat_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    pdf_data TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_invoices_org_id
   ON {schema}.invoices(org_id);`,

  // ── factuurnummer sequence ─────────────────────────────────────────
  `CREATE SEQUENCE IF NOT EXISTS {schema}.invoice_number_seq START 1;`,

  // ── bestaande organisaties: trial ver in de toekomst zodat ze niet geblokkeerd worden ──
  `UPDATE {schema}.organizations
   SET trial_expires_at = NOW() + INTERVAL '10 years'
   WHERE active_plan = 'free' AND trial_expires_at IS NULL;`,

  // ── Live-modus: uitbreiding op planner_plans ──────────────────────────
  `ALTER TABLE {schema}.planner_plans
    ADD COLUMN IF NOT EXISTS live_status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS live_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS live_schedule_offset_seconds INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS live_config JSONB NOT NULL DEFAULT '{}'::jsonb;`,

  // ── Live-modus: match resultaten ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id TEXT NOT NULL REFERENCES {schema}.planner_plans(id) ON DELETE CASCADE,
    timeslot_index INT NOT NULL,
    station_id TEXT NOT NULL,
    group_a_id TEXT NOT NULL,
    group_b_id TEXT,
    score_a INT,
    score_b INT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    cancel_reason TEXT,
    version INT NOT NULL DEFAULT 1,
    entered_by_token_id UUID,
    entered_at TIMESTAMPTZ,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, timeslot_index, station_id, group_a_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_match_results_plan
   ON {schema}.match_results(plan_id);`,

  // ── Live-modus: toegangs-tokens per rol ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.live_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id TEXT NOT NULL REFERENCES {schema}.planner_plans(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    scope_id TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    use_count INT NOT NULL DEFAULT 0
  );`,

  `CREATE INDEX IF NOT EXISTS idx_live_tokens_plan
   ON {schema}.live_access_tokens(plan_id);`,

  // ── Live-modus: raw tokens opslaan zodat organisator ze later kan terugzien ──
  `ALTER TABLE {schema}.live_access_tokens
    ADD COLUMN IF NOT EXISTS token TEXT,
    ALTER COLUMN token_hash DROP NOT NULL;`,

  `CREATE UNIQUE INDEX IF NOT EXISTS idx_live_tokens_token
   ON {schema}.live_access_tokens(token);`,

  // ── Live-modus: vrije tekst-opmerking bij afgelaste wedstrijden ──
  `ALTER TABLE {schema}.match_results
    ADD COLUMN IF NOT EXISTS cancel_note TEXT;`,

  // ── Kroegentochten: eigen entiteit los van planner_plans ─────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.kroegentochten (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES {schema}.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_plan_id TEXT,
    config_snapshot JSONB NOT NULL,
    plan_snapshot JSONB NOT NULL,
    live_status TEXT NOT NULL DEFAULT 'live',
    live_started_at TIMESTAMPTZ,
    live_completed_at TIMESTAMPTZ,
    live_schedule_offset_seconds INT NOT NULL DEFAULT 0,
    live_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_kroegentochten_org_id
   ON {schema}.kroegentochten(org_id);`,

  `CREATE INDEX IF NOT EXISTS idx_kroegentochten_live_status
   ON {schema}.kroegentochten(live_status);`,

  // ── Kroegentochten: kroegentocht_id op match_results ─────────────────────────
  `ALTER TABLE {schema}.match_results
    ADD COLUMN IF NOT EXISTS kroegentocht_id TEXT REFERENCES {schema}.kroegentochten(id) ON DELETE CASCADE;`,

  `CREATE INDEX IF NOT EXISTS idx_match_results_kroegentocht
   ON {schema}.match_results(kroegentocht_id);`,

  // ── Kroegentochten: kroegentocht_id op live_access_tokens ────────────────────
  `ALTER TABLE {schema}.live_access_tokens
    ADD COLUMN IF NOT EXISTS kroegentocht_id TEXT REFERENCES {schema}.kroegentochten(id) ON DELETE CASCADE;`,

  `CREATE INDEX IF NOT EXISTS idx_live_tokens_kroegentocht
   ON {schema}.live_access_tokens(kroegentocht_id);`,

  // ── Kroegentochten: plan_id nullable maken voor nieuwe rijen ─────────────
  `ALTER TABLE {schema}.match_results ALTER COLUMN plan_id DROP NOT NULL;`,

  `ALTER TABLE {schema}.live_access_tokens ALTER COLUMN plan_id DROP NOT NULL;`,

  // ── Kroegentochten: migreer bestaande live/completed plannen (idempotent) ─
  `INSERT INTO {schema}.kroegentochten (id, org_id, name, source_plan_id, config_snapshot, plan_snapshot, live_status, live_started_at, live_completed_at, live_schedule_offset_seconds, live_config, created_at)
   SELECT
     'sd-' || p.id,
     p.org_id,
     COALESCE(c.payload->>'name', 'Kroegentocht'),
     p.id,
     c.payload,
     p.payload,
     p.live_status,
     p.live_started_at,
     p.live_completed_at,
     p.live_schedule_offset_seconds,
     p.live_config,
     COALESCE(p.live_started_at, NOW())
   FROM {schema}.planner_plans p
   JOIN {schema}.planner_configs c ON c.id = p.config_id
   WHERE p.live_status != 'draft' AND p.org_id IS NOT NULL
   ON CONFLICT (id) DO NOTHING;`,

  // ── Kroegentochten: zet kroegentocht_id op gemigreerde match_results ─────────
  `UPDATE {schema}.match_results mr
   SET kroegentocht_id = s.id
   FROM {schema}.kroegentochten s
   WHERE s.source_plan_id = mr.plan_id AND mr.kroegentocht_id IS NULL;`,

  // ── Kroegentochten: zet kroegentocht_id op gemigreerde live_access_tokens ────
  `UPDATE {schema}.live_access_tokens lat
   SET kroegentocht_id = s.id
   FROM {schema}.kroegentochten s
   WHERE s.source_plan_id = lat.plan_id AND lat.kroegentocht_id IS NULL;`,

  // ── Kroegentochten: gemigreerde plannen terug naar draft ─────────────────
  `UPDATE {schema}.planner_plans
   SET live_status = 'draft'
   WHERE live_status != 'draft'
     AND EXISTS (SELECT 1 FROM {schema}.kroegentochten s WHERE s.source_plan_id = id);`,

  // ── Kroegentochten: unieke constraint voor nieuwe matches ────────────────
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_match_results_kroegentocht_unique
   ON {schema}.match_results(kroegentocht_id, timeslot_index, station_id, group_a_id)
   WHERE kroegentocht_id IS NOT NULL;`,

  // ── Kroegentochten: soft delete ──────────────────────────────────────────
  `ALTER TABLE {schema}.kroegentochten
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`,

  // ── Kroegentochten: hard delete na 30 dagen prullenbak ───────────────────
  `DELETE FROM {schema}.kroegentochten
   WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';`,

  // ── Organisatie-spellenbibliotheek ─────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.organization_spellen (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES {schema}.organizations(id) ON DELETE CASCADE,
    base_key TEXT,
    name TEXT NOT NULL,
    materials JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_org_spellen_org_id
   ON {schema}.organization_spellen(org_id);`,

  // ── Spelbegeleider-naam op tokens ───────────────────────────────────
  `ALTER TABLE {schema}.live_access_tokens
    ADD COLUMN IF NOT EXISTS supervisor_name TEXT;`,

  // ── Audit log voor score-wijzigingen ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.match_result_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL,
    old_score_a INT,
    old_score_b INT,
    new_score_a INT,
    new_score_b INT,
    old_status TEXT,
    new_status TEXT,
    changed_by_token_id UUID,
    changed_by_user_id TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_match_result_log_match_id
   ON {schema}.match_result_log(match_id);`,

  // ── Score-invoer: naam van de persoon die de score invoerde ─────────
  `ALTER TABLE {schema}.match_results
    ADD COLUMN IF NOT EXISTS entered_by_name TEXT;`,

  `ALTER TABLE {schema}.match_result_log
    ADD COLUMN IF NOT EXISTS changed_by_name TEXT;`,

  // ── Chat: berichten ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.kroegentocht_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kroegentocht_id TEXT NOT NULL REFERENCES {schema}.kroegentochten(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    is_broadcast BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_chat_msg_channel
   ON {schema}.kroegentocht_chat_messages(kroegentocht_id, channel_key, created_at);`,

  `CREATE INDEX IF NOT EXISTS idx_chat_msg_broadcast
   ON {schema}.kroegentocht_chat_messages(kroegentocht_id, is_broadcast, created_at)
   WHERE is_broadcast = TRUE;`,

  // ── Chat: leesbevestigingen ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.kroegentocht_chat_read_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kroegentocht_id TEXT NOT NULL REFERENCES {schema}.kroegentochten(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    participant_key TEXT NOT NULL,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (kroegentocht_id, channel_key, participant_key)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_chat_read_lookup
   ON {schema}.kroegentocht_chat_read_status(kroegentocht_id, participant_key);`,

  // ── Kroegentochten: beheerdernaam ───────────────────────────────────────
  `ALTER TABLE {schema}.kroegentochten
    ADD COLUMN IF NOT EXISTS admin_name TEXT;`,

  // ── Spelbegeleiders per station ─────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.kroegentocht_station_supervisors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kroegentocht_id TEXT NOT NULL REFERENCES {schema}.kroegentochten(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL,
    name TEXT NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (kroegentocht_id, station_id, name)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_station_supervisors_kroegentocht
   ON {schema}.kroegentocht_station_supervisors(kroegentocht_id);`,

  // ── Station supervisors: token_id nullable + unique op naam ─────────
  `DO $$ BEGIN
     ALTER TABLE {schema}.kroegentocht_station_supervisors ALTER COLUMN token_id DROP NOT NULL;
   EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
   END $$;`,

  `DO $$ BEGIN
     ALTER TABLE {schema}.kroegentocht_station_supervisors
       DROP CONSTRAINT IF EXISTS kroegentocht_station_supervisors_kroegentocht_id_station_id_token_i_key;
   EXCEPTION WHEN undefined_table THEN NULL;
   END $$;`,

  `DO $$ BEGIN
     CREATE UNIQUE INDEX IF NOT EXISTS idx_station_sv_unique_name
       ON {schema}.kroegentocht_station_supervisors(kroegentocht_id, station_id, name);
   EXCEPTION WHEN undefined_table THEN NULL;
   END $$;`,

  // ── Push subscriptions ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kroegentocht_id TEXT NOT NULL REFERENCES {schema}.kroegentochten(id) ON DELETE CASCADE,
    participant_key TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (kroegentocht_id, participant_key, endpoint)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_push_subs_kroegentocht
   ON {schema}.push_subscriptions(kroegentocht_id);`,

  // ── Foto-uploads ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.kroegentocht_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kroegentocht_id TEXT NOT NULL REFERENCES {schema}.kroegentochten(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL,
    timeslot_index INT,
    uploaded_by_name TEXT,
    file_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_kroegentocht_photos_kroegentocht
   ON {schema}.kroegentocht_photos(kroegentocht_id, created_at DESC);`,

  // ── Foto-instellingen + moderatie ──────────────────────────────────
  `ALTER TABLE {schema}.kroegentochten
    ADD COLUMN IF NOT EXISTS photos_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,

  `ALTER TABLE {schema}.kroegentochten
    ADD COLUMN IF NOT EXISTS photo_auto_approve BOOLEAN NOT NULL DEFAULT FALSE;`,

  `ALTER TABLE {schema}.kroegentocht_photos
    ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE;`,

  // Bestaande foto's goedkeuren + foto's inschakelen voor kroegentochten die al foto's hebben
  `UPDATE {schema}.kroegentocht_photos SET approved = TRUE WHERE approved = FALSE
     AND kroegentocht_id IN (SELECT id FROM {schema}.kroegentochten WHERE live_status IN ('live', 'completed'));`,

  `UPDATE {schema}.kroegentochten SET photos_enabled = TRUE
     WHERE id IN (SELECT DISTINCT kroegentocht_id FROM {schema}.kroegentocht_photos);`,

  // ── Programma-items ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS {schema}.kroegentocht_program_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kroegentocht_id TEXT NOT NULL REFERENCES {schema}.kroegentochten(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    icon TEXT NOT NULL DEFAULT 'event',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_program_items_kroegentocht
   ON {schema}.kroegentocht_program_items(kroegentocht_id, start_time);`,

  // ── Team-leden (org address book + group assignments) ──────────────
  `CREATE TABLE IF NOT EXISTS {schema}.team_members (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES {schema}.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_18_plus BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_team_members_org
   ON {schema}.team_members(org_id);`,

  `CREATE TABLE IF NOT EXISTS {schema}.group_memberships (
    member_id TEXT NOT NULL REFERENCES {schema}.team_members(id) ON DELETE CASCADE,
    config_id TEXT NOT NULL REFERENCES {schema}.planner_configs(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL,
    PRIMARY KEY (member_id, config_id, group_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_group_memberships_config
   ON {schema}.group_memberships(config_id, group_id);`,
];

export async function runMigrations(client: PgClient, schema = "public"): Promise<void> {
  for (const template of migrations) {
    const sql = template.replaceAll("{schema}", schema);
    await client.query(sql);
  }

  // Programmatische migratie: verschuif timeslots in bestaande kroegentochten
  await migrateTimeslotShift(client, schema);
}

/**
 * Eenmalige migratie: verschuif timeslot-tijden in configSnapshot van bestaande kroegentochten
 * zodat ze overeenkomen met de daadwerkelijke starttijd (liveStartedAt).
 * Markeert verwerkte kroegentochten met een flag in de JSON om dubbele verwerking te voorkomen.
 */
async function migrateTimeslotShift(client: PgClient, schema: string): Promise<void> {
  const result = await client.query<{
    id: string; config_snapshot: ConfigV2; live_started_at: string;
  }>(
    `SELECT id, config_snapshot, live_started_at FROM ${schema}.kroegentochten
     WHERE live_started_at IS NOT NULL
       AND live_status IN ('live', 'completed')
       AND NOT (config_snapshot ? '_timeslotsShifted');`
  );

  for (const row of result.rows) {
    const config = typeof row.config_snapshot === "string"
      ? JSON.parse(row.config_snapshot) as ConfigV2
      : row.config_snapshot;

    const activeSlots = (config.timeslots ?? [])
      .filter((t) => t.kind === "active")
      .sort((a, b) => a.index - b.index);
    if (activeSlots.length === 0) continue;

    const firstSlotMs = new Date(activeSlots[0].start).getTime();
    // Gebruik lokale uren/minuten om fake-UTC conventie te behouden
    const actualStart = new Date(row.live_started_at);
    const targetMs = Date.UTC(2026, 0, 1, actualStart.getHours(), actualStart.getMinutes(), 0, 0);
    const offsetMs = targetMs - firstSlotMs;

    // Alleen verschuiven als er een significant verschil is (>1 min)
    if (Math.abs(offsetMs) < 60_000) {
      // Markeer als verwerkt
      await client.query(
        `UPDATE ${schema}.kroegentochten SET config_snapshot = config_snapshot || '{"_timeslotsShifted": true}'::jsonb WHERE id = $1;`,
        [row.id]
      );
      continue;
    }

    const fmt = (d: Date) =>
      `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

    const shiftedTimeslots = config.timeslots.map((t) => {
      const newStart = new Date(new Date(t.start).getTime() + offsetMs);
      const newEnd = new Date(new Date(t.end).getTime() + offsetMs);
      return { ...t, start: newStart.toISOString(), end: newEnd.toISOString(), label: `${fmt(newStart)} - ${fmt(newEnd)}` };
    });

    const shiftedConfig = { ...config, timeslots: shiftedTimeslots, _timeslotsShifted: true };
    await client.query(
      `UPDATE ${schema}.kroegentochten SET config_snapshot = $2::jsonb WHERE id = $1;`,
      [row.id, JSON.stringify(shiftedConfig)]
    );
  }
}
