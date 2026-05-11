import type { LiveConfig, LiveStatus } from "@core";

export interface LiveStatusResponse {
  status: LiveStatus;
  startedAt: string | null;
  completedAt: string | null;
  scheduleOffsetSeconds: number;
  config: LiveConfig;
}

export type LiveRole = "supervisor" | "program" | "scoreboard";

export interface LiveActiveToken {
  id: string;
  rawToken: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
}

export interface LiveTokenSlot {
  role: LiveRole;
  scopeId: string | null;
  label: string;
  activeToken: LiveActiveToken | null;
}

export async function getLiveStatus(planId: string): Promise<LiveStatusResponse> {
  const res = await fetch(`/api/live/plans/${encodeURIComponent(planId)}/status`);
  if (!res.ok) throw new Error((await res.json()).error ?? "Kon live-status niet laden.");
  return res.json();
}

export async function setLiveStatus(
  planId: string,
  next: LiveStatus,
  liveConfig?: Partial<LiveConfig>,
  startMode?: "scheduled" | "now",
  scheduledDatetime?: string
): Promise<{ status: LiveStatus; tokens: unknown[] }> {
  const res = await fetch(`/api/live/plans/${encodeURIComponent(planId)}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: next, liveConfig, startMode, scheduledDatetime }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Kon status niet aanpassen.");
  return res.json();
}

export async function listLiveTokens(planId: string): Promise<LiveTokenSlot[]> {
  const res = await fetch(`/api/live/plans/${encodeURIComponent(planId)}/tokens`);
  if (!res.ok) throw new Error((await res.json()).error ?? "Kon tokens niet laden.");
  const data = await res.json();
  return data.slots;
}

export async function regenerateLiveToken(
  planId: string,
  role: LiveRole,
  scopeId: string | null
): Promise<LiveActiveToken> {
  const res = await fetch(`/api/live/plans/${encodeURIComponent(planId)}/tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role, scopeId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Kon token niet regenereren.");
  const data = await res.json();
  return {
    id: data.token.id,
    rawToken: data.token.rawToken,
    createdAt: new Date().toISOString(),
    expiresAt: data.token.expiresAt,
    lastUsedAt: null,
    useCount: 0,
  };
}

export async function revokeLiveTokenById(planId: string, tokenId: string): Promise<void> {
  const res = await fetch(`/api/live/plans/${encodeURIComponent(planId)}/tokens?tokenId=${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Kon token niet intrekken.");
}

export function buildLiveUrl(role: LiveRole, rawToken: string, baseUrl: string, planId: string): string {
  if (!rawToken) return "";
  const path = role === "supervisor" ? "supervise" : role === "program" ? "program" : "scoreboard";
  return `${baseUrl}/live/${encodeURIComponent(planId)}/${path}/${encodeURIComponent(rawToken)}`;
}
