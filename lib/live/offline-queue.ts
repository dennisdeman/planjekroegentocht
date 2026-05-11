"use client";

import type { SubmitScoreInput } from "./use-live-state";

const STORAGE_KEY = "live-score-queue";
const RETRY_INTERVAL_MS = 10_000;

export interface QueuedScore {
  id: string;
  token: string;
  input: SubmitScoreInput;
  queuedAt: number;
  retries: number;
}

function dedupeKey(input: SubmitScoreInput): string {
  return `${input.timeslotIndex}|${input.stationId}|${input.groupAId}`;
}

function loadQueue(): QueuedScore[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedScore[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage vol of niet beschikbaar
  }
}

export function enqueueScore(token: string, input: SubmitScoreInput): void {
  const queue = loadQueue();
  const key = dedupeKey(input);
  // Vervang als er al een entry is voor dezelfde match
  const filtered = queue.filter((q) => dedupeKey(q.input) !== key);
  filtered.push({
    id: `${key}-${Date.now()}`,
    token,
    input,
    queuedAt: Date.now(),
    retries: 0,
  });
  saveQueue(filtered);
}

export function getQueueSize(): number {
  return loadQueue().length;
}

export function getQueuedScores(): QueuedScore[] {
  return loadQueue();
}

export function removeFromQueue(id: string): void {
  const queue = loadQueue().filter((q) => q.id !== id);
  saveQueue(queue);
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function startQueueProcessor(
  onFlush: () => void,
  onError?: (msg: string) => void
): () => void {
  let running = true;

  async function processQueue() {
    if (!running) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    for (const item of queue) {
      if (!running) break;
      try {
        const res = await fetch(`/api/live/supervisor/${encodeURIComponent(item.token)}/match`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item.input),
        });
        if (res.ok || res.status === 409) {
          // Gelukt of conflict (match is al bijgewerkt) — verwijder uit queue
          removeFromQueue(item.id);
        } else if (res.status >= 500) {
          // Server-fout — retry later
          item.retries += 1;
          saveQueue(loadQueue().map((q) => (q.id === item.id ? item : q)));
        } else {
          // Client-fout (400, 403 etc.) — verwijder, geen retry
          removeFromQueue(item.id);
          onError?.(`Score voor ronde ${item.input.timeslotIndex} kon niet worden verzonden: ${res.status}`);
        }
      } catch {
        // Netwerk-fout — retry later
        item.retries += 1;
        saveQueue(loadQueue().map((q) => (q.id === item.id ? item : q)));
      }
    }
    onFlush();
  }

  const id = setInterval(() => { void processQueue(); }, RETRY_INTERVAL_MS);
  // Direct eerste poging
  void processQueue();

  return () => {
    running = false;
    clearInterval(id);
  };
}
