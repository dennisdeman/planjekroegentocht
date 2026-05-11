import type { Config, Id, Plan } from "@core";
import type { ConfigRecord, PlanRecord, PlannerStorage } from "@storage";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        detail = payload.error;
      }
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export class ApiPlannerStorage implements PlannerStorage {
  constructor(private readonly baseUrl = "/api/planner") {}

  async saveConfig(config: Config): Promise<void> {
    await parseJson<{ ok: boolean }>(
      await fetch(`${this.baseUrl}/configs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      })
    );
  }

  async savePlan(plan: Plan): Promise<void> {
    await parseJson<{ ok: boolean }>(
      await fetch(`${this.baseUrl}/plans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      })
    );
  }

  async listConfigs(): Promise<ConfigRecord[]> {
    const data = await parseJson<{ configs: ConfigRecord[] }>(await fetch(`${this.baseUrl}/configs`));
    return data.configs;
  }

  async listPlans(configId?: Id): Promise<PlanRecord[]> {
    const query = configId ? `?configId=${encodeURIComponent(configId)}` : "";
    const data = await parseJson<{ plans: PlanRecord[] }>(
      await fetch(`${this.baseUrl}/plans${query}`)
    );
    return data.plans;
  }

  async loadConfig(configId: Id): Promise<Config | null> {
    const data = await parseJson<{ config: Config | null }>(
      await fetch(`${this.baseUrl}/configs/${encodeURIComponent(configId)}`)
    );
    return data.config;
  }

  async loadPlan(planId: Id): Promise<Plan | null> {
    const data = await parseJson<{ plan: Plan | null }>(
      await fetch(`${this.baseUrl}/plans/${encodeURIComponent(planId)}`)
    );
    return data.plan;
  }

  async deleteConfig(configId: Id): Promise<void> {
    await parseJson<{ ok: boolean }>(
      await fetch(`${this.baseUrl}/configs/${encodeURIComponent(configId)}`, { method: "DELETE" })
    );
  }

  async deletePlan(planId: Id): Promise<void> {
    await parseJson<{ ok: boolean }>(
      await fetch(`${this.baseUrl}/plans/${encodeURIComponent(planId)}`, { method: "DELETE" })
    );
  }
}
