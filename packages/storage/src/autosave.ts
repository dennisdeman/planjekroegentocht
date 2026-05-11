import type { Config, Id, Plan } from "../../core/src/model";
import type { AutosaveHooks, PlannerStorage } from "./types";

export interface AutosaveOptions extends AutosaveHooks {
  debounceMs?: number;
}

type SaveTask = () => Promise<void>;

export class PlannerAutosave {
  private readonly debounceMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingTask: SaveTask | null = null;

  constructor(
    private readonly storage: PlannerStorage,
    private readonly options: AutosaveOptions = {}
  ) {
    this.debounceMs = Math.max(0, options.debounceMs ?? 500);
  }

  scheduleConfigSave(config: Config): void {
    const id = config.id;
    this.schedule(async () => {
      try {
        await this.storage.saveConfig(config);
        this.options.onSaveSuccess?.("config", id);
      } catch (error) {
        this.options.onSaveError?.("config", id, error);
      }
    });
  }

  schedulePlanSave(plan: Plan): void {
    const id = plan.id;
    this.schedule(async () => {
      try {
        await this.storage.savePlan(plan);
        this.options.onSaveSuccess?.("plan", id);
      } catch (error) {
        this.options.onSaveError?.("plan", id, error);
      }
    });
  }

  private schedule(task: SaveTask): void {
    this.pendingTask = task;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      const execute = this.pendingTask;
      this.pendingTask = null;
      this.timer = null;
      if (execute) {
        void execute();
      }
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const task = this.pendingTask;
    this.pendingTask = null;
    if (task) {
      await task();
    }
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingTask = null;
  }
}

export interface LastOpenedState {
  configId: Id | null;
  planId: Id | null;
  updatedAtIso: string;
}

const DEFAULT_RECOVERY_KEY = "kroegentocht.recovery.v2:last-opened";

export function saveRecoveryPointer(state: LastOpenedState, key = DEFAULT_RECOVERY_KEY): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(key, JSON.stringify(state));
}

export function loadRecoveryPointer(key = DEFAULT_RECOVERY_KEY): LastOpenedState | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as LastOpenedState;
  } catch {
    return null;
  }
}
