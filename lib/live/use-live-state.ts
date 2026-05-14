"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveState, MatchResult, MatchStatus, MatchCancelReason } from "@core";

export interface LivePublicConfig {
  id: string;
  name: string;
  groups: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string; lat?: number; lng?: number; address?: string }>;
  activityTypes: Array<{ id: string; name: string; baseId?: string | null }>;
  stations: Array<{ id: string; locationId: string; activityTypeId: string }>;
  timeslots: Array<{ id: string; index: number; kind: "active" | "break"; start: string; end: string; label?: string }>;
  scheduleSettings: { roundDurationMinutes: number; transitionMinutes: number; scheduleMode: string };
}

export interface LiveStateResponse {
  planName: string;
  role: "supervisor" | "program" | "scoreboard";
  scopeId: string | null;
  tokenId?: string;
  state: LiveState;
  config: LivePublicConfig;
  publicTokens?: { program: string | null; scoreboard: string | null };
  photosEnabled?: boolean;
  logoData?: string | null;
}

export interface UseLiveStateResult {
  data: LiveStateResponse | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useLiveState(
  role: "supervisor" | "program" | "scoreboard",
  token: string,
  pollIntervalMs: number = 8000
): UseLiveStateResult {
  const [data, setData] = useState<LiveStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  async function fetchState() {
    try {
      const res = await fetch(`/api/live/${role}/${encodeURIComponent(token)}/state`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Fout: ${res.status}`);
      }
      const body = (await res.json()) as LiveStateResponse;
      if (!cancelledRef.current) {
        setData(body);
        setError(null);
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : "Onbekende fout.");
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    cancelledRef.current = false;
    void fetchState();
    const id = setInterval(() => { void fetchState(); }, pollIntervalMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, token, pollIntervalMs]);

  return {
    data,
    error,
    loading,
    refresh: fetchState,
  };
}

export interface SubmitScoreInput {
  timeslotIndex: number;
  stationId: string;
  groupAId: string;
  scoreA: number | null;
  scoreB: number | null;
  status: MatchStatus;
  cancelReason?: MatchCancelReason | null;
  cancelNote?: string | null;
  version: number;
  enteredByName?: string;
}

export type SubmitScoreResult =
  | { ok: true; match: MatchResult }
  | { ok: false; conflict?: MatchResult; error: string };

export async function submitScore(
  token: string,
  input: SubmitScoreInput
): Promise<SubmitScoreResult> {
  const res = await fetch(`/api/live/supervisor/${encodeURIComponent(token)}/match`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 409) {
    const body = await res.json();
    return { ok: false, conflict: body.current, error: body.error ?? "Versie-conflict." };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.error ?? `Fout: ${res.status}` };
  }
  const body = await res.json();
  return { ok: true, match: body.match };
}
