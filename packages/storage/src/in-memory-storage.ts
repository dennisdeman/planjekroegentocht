import type { Config, Id, Plan } from "../../core/src/model";
import type { ConfigRecord, PlanRecord, PlannerStorage } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class InMemoryPlannerStorage implements PlannerStorage {
  private readonly configs = new Map<Id, ConfigRecord>();
  private readonly plans = new Map<Id, PlanRecord>();

  async saveConfig(config: Config): Promise<void> {
    this.configs.set(config.id, {
      id: config.id,
      updatedAtIso: nowIso(),
      config: deepClone(config),
    });
  }

  async savePlan(plan: Plan): Promise<void> {
    this.plans.set(plan.id, {
      id: plan.id,
      configId: plan.configId,
      updatedAtIso: nowIso(),
      plan: deepClone(plan),
    });
  }

  async listConfigs(): Promise<ConfigRecord[]> {
    return Array.from(this.configs.values())
      .map((record) => deepClone(record))
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  async listPlans(configId?: Id): Promise<PlanRecord[]> {
    const records = Array.from(this.plans.values()).filter((record) =>
      configId ? record.configId === configId : true
    );
    return records
      .map((record) => deepClone(record))
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  async loadConfig(configId: Id): Promise<Config | null> {
    const record = this.configs.get(configId);
    return record ? deepClone(record.config) : null;
  }

  async loadPlan(planId: Id): Promise<Plan | null> {
    const record = this.plans.get(planId);
    return record ? deepClone(record.plan) : null;
  }

  async deleteConfig(configId: Id): Promise<void> {
    this.configs.delete(configId);
  }

  async deletePlan(planId: Id): Promise<void> {
    this.plans.delete(planId);
  }
}
