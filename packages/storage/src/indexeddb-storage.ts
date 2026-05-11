import type { Config, Id, Plan } from "../../core/src/model";
import type { ConfigRecord, PlanRecord, PlannerStorage } from "./types";

const DEFAULT_DB_NAME = "kroegentocht.v2.planner";
const DEFAULT_DB_VERSION = 1;
const CONFIG_STORE = "configs";
const PLAN_STORE = "plans";

function nowIso(): string {
  return new Date().toISOString();
}

type StoreName = typeof CONFIG_STORE | typeof PLAN_STORE;

function ensureIndexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment.");
  }
  return indexedDB;
}

function openDb(dbName: string, version = DEFAULT_DB_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = ensureIndexedDb().open(dbName, version);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PLAN_STORE)) {
        const planStore = db.createObjectStore(PLAN_STORE, { keyPath: "id" });
        planStore.createIndex("configId", "configId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function txPut<T>(db: IDBDatabase, storeName: StoreName, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write transaction failed."));
    tx.oncomplete = () => resolve();
    tx.objectStore(storeName).put(value);
  });
}

function txDelete(db: IDBDatabase, storeName: StoreName, id: Id): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete transaction failed."));
    tx.oncomplete = () => resolve();
    tx.objectStore(storeName).delete(id);
  });
}

function txGet<T>(db: IDBDatabase, storeName: StoreName, id: Id): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read transaction failed."));
    const request = tx.objectStore(storeName).get(id);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB get failed."));
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
  });
}

function txGetAll<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read transaction failed."));
    const request = tx.objectStore(storeName).getAll();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB getAll failed."));
    request.onsuccess = () => resolve((request.result as T[]) ?? []);
  });
}

export class IndexedDbPlannerStorage implements PlannerStorage {
  constructor(private readonly dbName: string = DEFAULT_DB_NAME) {}

  private async db(): Promise<IDBDatabase> {
    return openDb(this.dbName);
  }

  async saveConfig(config: Config): Promise<void> {
    const db = await this.db();
    await txPut(db, CONFIG_STORE, {
      id: config.id,
      updatedAtIso: nowIso(),
      config,
    } satisfies ConfigRecord);
  }

  async savePlan(plan: Plan): Promise<void> {
    const db = await this.db();
    await txPut(db, PLAN_STORE, {
      id: plan.id,
      configId: plan.configId,
      updatedAtIso: nowIso(),
      plan,
    } satisfies PlanRecord);
  }

  async listConfigs(): Promise<ConfigRecord[]> {
    const db = await this.db();
    const records = await txGetAll<ConfigRecord>(db, CONFIG_STORE);
    return records.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  async listPlans(configId?: Id): Promise<PlanRecord[]> {
    const db = await this.db();
    const records = await txGetAll<PlanRecord>(db, PLAN_STORE);
    return records
      .filter((record) => (configId ? record.configId === configId : true))
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  async loadConfig(configId: Id): Promise<Config | null> {
    const db = await this.db();
    const record = await txGet<ConfigRecord>(db, CONFIG_STORE, configId);
    return record?.config ?? null;
  }

  async loadPlan(planId: Id): Promise<Plan | null> {
    const db = await this.db();
    const record = await txGet<PlanRecord>(db, PLAN_STORE, planId);
    return record?.plan ?? null;
  }

  async deleteConfig(configId: Id): Promise<void> {
    const db = await this.db();
    await txDelete(db, CONFIG_STORE, configId);
  }

  async deletePlan(planId: Id): Promise<void> {
    const db = await this.db();
    await txDelete(db, PLAN_STORE, planId);
  }
}
