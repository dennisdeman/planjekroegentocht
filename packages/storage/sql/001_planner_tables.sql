CREATE TABLE IF NOT EXISTS public.planner_configs (
  id TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS public.planner_plans (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES public.planner_configs(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_plans_config_id
  ON public.planner_plans(config_id);
