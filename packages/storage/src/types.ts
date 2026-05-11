import type { Config, Id, Plan } from "../../core/src/model";

export interface ConfigRecord {
  id: Id;
  updatedAtIso: string;
  config: Config;
}

export interface PlanRecord {
  id: Id;
  configId: Id;
  updatedAtIso: string;
  plan: Plan;
}

export interface PlannerStorage {
  saveConfig(config: Config, orgId?: Id): Promise<void>;
  savePlan(plan: Plan, orgId?: Id): Promise<void>;
  listConfigs(orgId?: Id): Promise<ConfigRecord[]>;
  listPlans(configId?: Id, orgId?: Id): Promise<PlanRecord[]>;
  loadConfig(configId: Id, orgId?: Id): Promise<Config | null>;
  loadPlan(planId: Id, orgId?: Id): Promise<Plan | null>;
  deleteConfig(configId: Id, orgId?: Id): Promise<void>;
  deletePlan(planId: Id, orgId?: Id): Promise<void>;
}

export interface AutosaveHooks {
  onSaveSuccess?: (kind: "config" | "plan", id: Id) => void;
  onSaveError?: (kind: "config" | "plan", id: Id, error: unknown) => void;
}
