import type { LiveConfig, LiveStatus } from "@core";

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

export interface KroegentochtListItem {
  id: string;
  name: string;
  liveStatus: LiveStatus;
  liveStartedAt: string | null;
  liveCompletedAt: string | null;
  effectiveEndAt: string | null;
  createdAt: string;
  programToken: string | null;
  scoreboardToken: string | null;
}

export interface KroegentochtStatusResponse {
  status: LiveStatus;
  startedAt: string | null;
  completedAt: string | null;
  scheduleOffsetSeconds: number;
  config: LiveConfig;
  effectiveEndAt?: string | null;
  adminName?: string | null;
  photosEnabled?: boolean;
  photoAutoApprove?: boolean;
}

export async function listKroegentochten(): Promise<KroegentochtListItem[]> {
  const res = await fetch("/api/kroegentochten");
  if (!res.ok) throw new Error((await res.json()).error ?? "Laden mislukt.");
  const data = await res.json();
  return data.items;
}

export async function createKroegentocht(
  planId: string,
  liveConfig?: Partial<LiveConfig>,
  startMode?: "scheduled" | "now",
  scheduledDatetime?: string,
  adminName?: string,
  photosEnabled?: boolean
): Promise<{ kroegentocht: { id: string; name: string; liveStatus: LiveStatus }; tokens: unknown[] }> {
  const res = await fetch("/api/kroegentochten/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId, liveConfig, startMode, scheduledDatetime, adminName, photosEnabled }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Kroegentocht aanmaken mislukt.");
  return res.json();
}

export async function getKroegentochtStatus(kroegentochtId: string): Promise<KroegentochtStatusResponse> {
  const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/status`);
  if (!res.ok) throw new Error((await res.json()).error ?? "Status laden mislukt.");
  return res.json();
}

export async function setKroegentochtStatus(
  kroegentochtId: string,
  next: LiveStatus
): Promise<{ status: LiveStatus }> {
  const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: next }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Status aanpassen mislukt.");
  return res.json();
}

export async function updateKroegentochtSettings(
  kroegentochtId: string,
  settings: { startedAt?: string; liveConfig?: Partial<LiveConfig>; adminName?: string }
): Promise<KroegentochtStatusResponse> {
  const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Instellingen opslaan mislukt.");
  return res.json();
}

export async function listKroegentochtTokens(kroegentochtId: string): Promise<LiveTokenSlot[]> {
  const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/tokens`);
  if (!res.ok) throw new Error((await res.json()).error ?? "Tokens laden mislukt.");
  const data = await res.json();
  return data.slots;
}

export async function regenerateKroegentochtToken(
  kroegentochtId: string,
  role: LiveRole,
  scopeId: string | null
): Promise<LiveActiveToken> {
  const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role, scopeId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Token regenereren mislukt.");
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

export async function revokeKroegentochtToken(kroegentochtId: string, tokenId: string): Promise<void> {
  const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/tokens?tokenId=${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Token intrekken mislukt.");
}

export function buildKroegentochtUrl(role: LiveRole, rawToken: string, baseUrl: string, kroegentochtId: string): string {
  if (!rawToken) return "";
  const path = role === "supervisor" ? "supervise" : role === "program" ? "program" : "scoreboard";
  return `${baseUrl}/live/${encodeURIComponent(kroegentochtId)}/${path}/${encodeURIComponent(rawToken)}`;
}

export function buildMediaUrl(programToken: string, baseUrl: string, kroegentochtId: string): string {
  if (!programToken) return "";
  return `${baseUrl}/live/${encodeURIComponent(kroegentochtId)}/media/${encodeURIComponent(programToken)}`;
}
