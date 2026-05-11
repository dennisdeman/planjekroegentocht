import type { Config, Id, Plan } from "../../core/src/model";
import type { ConfigRecord, PlanRecord, PlannerStorage } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export interface PgQueryResult<Row = unknown> {
  rows: Row[];
}

export interface PgClient {
  query<Row = unknown>(sql: string, params?: unknown[]): Promise<PgQueryResult<Row>>;
}

interface ConfigRow {
  id: string;
  updated_at: string;
  payload: Config;
}

interface PlanRow {
  id: string;
  config_id: string;
  updated_at: string;
  payload: Plan;
}

export class PostgresPlannerStorage implements PlannerStorage {
  constructor(private readonly client: PgClient, private readonly schema = "public") {}

  async ensureSchema(): Promise<void> {
    const s = `${this.schema}.`;
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${s}planner_configs (
        id TEXT PRIMARY KEY,
        updated_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL
      );
    `);
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${s}planner_plans (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES ${s}planner_configs(id) ON DELETE CASCADE,
        updated_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL
      );
    `);
    await this.client.query(`
      CREATE INDEX IF NOT EXISTS idx_planner_plans_config_id
      ON ${s}planner_plans(config_id);
    `);
  }

  async saveConfig(config: Config, orgId?: Id): Promise<void> {
    if (orgId) {
      const sql = `
        INSERT INTO ${this.schema}.planner_configs (id, updated_at, payload, org_id)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (id) DO UPDATE
        SET updated_at = EXCLUDED.updated_at,
            payload = EXCLUDED.payload;
      `;
      await this.client.query(sql, [config.id, nowIso(), JSON.stringify(config), orgId]);
    } else {
      const sql = `
        INSERT INTO ${this.schema}.planner_configs (id, updated_at, payload)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET updated_at = EXCLUDED.updated_at,
            payload = EXCLUDED.payload;
      `;
      await this.client.query(sql, [config.id, nowIso(), JSON.stringify(config)]);
    }
  }

  async savePlan(plan: Plan, orgId?: Id): Promise<void> {
    if (orgId) {
      const sql = `
        INSERT INTO ${this.schema}.planner_plans (id, config_id, updated_at, payload, org_id)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (id) DO UPDATE
        SET config_id = EXCLUDED.config_id,
            updated_at = EXCLUDED.updated_at,
            payload = EXCLUDED.payload;
      `;
      await this.client.query(sql, [plan.id, plan.configId, nowIso(), JSON.stringify(plan), orgId]);
    } else {
      const sql = `
        INSERT INTO ${this.schema}.planner_plans (id, config_id, updated_at, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET config_id = EXCLUDED.config_id,
            updated_at = EXCLUDED.updated_at,
            payload = EXCLUDED.payload;
      `;
      await this.client.query(sql, [plan.id, plan.configId, nowIso(), JSON.stringify(plan)]);
    }
  }

  async listConfigs(orgId?: Id): Promise<ConfigRecord[]> {
    if (orgId) {
      const sql = `
        SELECT id, updated_at, payload
        FROM ${this.schema}.planner_configs
        WHERE org_id = $1
        ORDER BY updated_at DESC;
      `;
      const result = await this.client.query<ConfigRow>(sql, [orgId]);
      return result.rows.map((row) => ({
        id: row.id,
        updatedAtIso: row.updated_at,
        config: row.payload,
      }));
    }
    const sql = `
      SELECT id, updated_at, payload
      FROM ${this.schema}.planner_configs
      ORDER BY updated_at DESC;
    `;
    const result = await this.client.query<ConfigRow>(sql);
    return result.rows.map((row) => ({
      id: row.id,
      updatedAtIso: row.updated_at,
      config: row.payload,
    }));
  }

  async listPlans(configId?: Id, orgId?: Id): Promise<PlanRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (typeof configId === "string" && configId.length > 0) {
      conditions.push(`config_id = $${paramIndex++}`);
      params.push(configId);
    }
    if (orgId) {
      conditions.push(`org_id = $${paramIndex++}`);
      params.push(orgId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT id, config_id, updated_at, payload
      FROM ${this.schema}.planner_plans
      ${where}
      ORDER BY updated_at DESC;
    `;
    const result = await this.client.query<PlanRow>(sql, params);
    return result.rows.map((row) => ({
      id: row.id,
      configId: row.config_id,
      updatedAtIso: row.updated_at,
      plan: row.payload,
    }));
  }

  async loadConfig(configId: Id, orgId?: Id): Promise<Config | null> {
    if (orgId) {
      const sql = `
        SELECT payload
        FROM ${this.schema}.planner_configs
        WHERE id = $1 AND org_id = $2;
      `;
      const result = await this.client.query<{ payload: Config }>(sql, [configId, orgId]);
      return result.rows[0]?.payload ?? null;
    }
    const sql = `
      SELECT payload
      FROM ${this.schema}.planner_configs
      WHERE id = $1;
    `;
    const result = await this.client.query<{ payload: Config }>(sql, [configId]);
    return result.rows[0]?.payload ?? null;
  }

  async loadPlan(planId: Id, orgId?: Id): Promise<Plan | null> {
    if (orgId) {
      const sql = `
        SELECT payload
        FROM ${this.schema}.planner_plans
        WHERE id = $1 AND org_id = $2;
      `;
      const result = await this.client.query<{ payload: Plan }>(sql, [planId, orgId]);
      return result.rows[0]?.payload ?? null;
    }
    const sql = `
      SELECT payload
      FROM ${this.schema}.planner_plans
      WHERE id = $1;
    `;
    const result = await this.client.query<{ payload: Plan }>(sql, [planId]);
    return result.rows[0]?.payload ?? null;
  }

  async deleteConfig(configId: Id, orgId?: Id): Promise<void> {
    if (orgId) {
      await this.client.query(
        `DELETE FROM ${this.schema}.planner_configs WHERE id = $1 AND org_id = $2;`,
        [configId, orgId]
      );
    } else {
      await this.client.query(
        `DELETE FROM ${this.schema}.planner_configs WHERE id = $1;`,
        [configId]
      );
    }
  }

  async deletePlan(planId: Id, orgId?: Id): Promise<void> {
    if (orgId) {
      await this.client.query(
        `DELETE FROM ${this.schema}.planner_plans WHERE id = $1 AND org_id = $2;`,
        [planId, orgId]
      );
    } else {
      await this.client.query(
        `DELETE FROM ${this.schema}.planner_plans WHERE id = $1;`,
        [planId]
      );
    }
  }
}
