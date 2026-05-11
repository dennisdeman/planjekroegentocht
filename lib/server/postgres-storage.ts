import { PostgresPlannerStorage } from "@storage";
import type { PgClient } from "@storage";
import { getPgPool } from "./postgres";
import { runMigrations } from "./migrations";

let pgClient: PgClient | null = null;
let storage: PostgresPlannerStorage | null = null;
let migrated = false;

function getClient(): PgClient {
  if (pgClient) {
    return pgClient;
  }
  pgClient = {
    query: async <Row = unknown>(sql: string, params?: unknown[]) => {
      const pool = getPgPool();
      return pool.query(sql, params) as unknown as Promise<{ rows: Row[] }>;
    },
  };
  return pgClient;
}

export function getSchema(): string {
  return process.env.PLANNER_DB_SCHEMA ?? "public";
}

export async function ensureMigrations(): Promise<void> {
  if (migrated) {
    return;
  }
  await runMigrations(getClient(), getSchema());
  migrated = true;
}

export async function getPostgresPlannerStorage(): Promise<PostgresPlannerStorage> {
  if (storage) {
    return storage;
  }
  const schema = getSchema();
  await ensureMigrations();
  storage = new PostgresPlannerStorage(getClient(), schema);
  return storage;
}

export { getClient };
