# Cloud Sync API (Postgres)

## Environment
- `DATABASE_URL` (required for cloud mode)
- `PLANNER_DB_SCHEMA` (optional, default `public`)
- `NEXT_PUBLIC_STORAGE_MODE=cloud` (client uses API storage instead of local IndexedDB)

## Endpoints
- `GET /api/planner/configs` -> `{ configs: ConfigRecord[] }`
- `POST /api/planner/configs` body `{ config }`
- `GET /api/planner/configs/:id` -> `{ config | null }`
- `DELETE /api/planner/configs/:id`
- `GET /api/planner/plans?configId=...` -> `{ plans: PlanRecord[] }`
- `POST /api/planner/plans` body `{ plan }`
- `GET /api/planner/plans/:id` -> `{ plan | null }`
- `DELETE /api/planner/plans/:id`

## Notes
- API routes are Node runtime.
- Schema creation is automatic on first request (`ensureSchema()`).
- Current conflict policy for multi-device is last-write-wins.
