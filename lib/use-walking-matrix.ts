"use client";

import { useEffect, useRef, useState } from "react";

interface CoordPoint {
  lat?: number;
  lng?: number;
}

interface MatrixState {
  /** durations[i][j] in seconden, of null als ORS dit paar niet kon berekenen */
  durations: (number | null)[][] | null;
  /** mapping van item-index in `points` naar index in de matrix (alleen items mét coords zitten erin) */
  matrixIndex: (number | null)[];
  loading: boolean;
  error: string | null;
}

const EMPTY: MatrixState = {
  durations: null,
  matrixIndex: [],
  loading: false,
  error: null,
};

/**
 * Roept /api/route-matrix aan met de coördinaten van `points` die lat+lng hebben.
 * Resultaat: `durations` matrix + `matrixIndex` mapping. Bij <2 valide punten of een
 * fout: laat de hook null returnen en moeten callers terugvallen op haversine.
 */
export function useWalkingMatrix(points: CoordPoint[]): MatrixState {
  const [state, setState] = useState<MatrixState>(EMPTY);
  // Stringified coord-set zodat we alleen opnieuw fetchen bij echte verandering.
  const coordKey = points
    .map((p) =>
      p.lat != null && p.lng != null ? `${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : "x"
    )
    .join("|");
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastKeyRef.current === coordKey) return;
    lastKeyRef.current = coordKey;

    const coords: [number, number][] = [];
    const indexMap: (number | null)[] = [];
    for (const p of points) {
      if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
        indexMap.push(coords.length);
        coords.push([p.lng, p.lat]);
      } else {
        indexMap.push(null);
      }
    }

    if (coords.length < 2) {
      setState({ ...EMPTY, matrixIndex: indexMap });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null, matrixIndex: indexMap }));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/route-matrix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coords }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          durations?: (number | null)[][] | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setState({
            durations: null,
            matrixIndex: indexMap,
            loading: false,
            error: data.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setState({
          durations: data.durations ?? null,
          matrixIndex: indexMap,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          durations: null,
          matrixIndex: indexMap,
          loading: false,
          error: e instanceof Error ? e.message : "Onbekende fout",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coordKey]);

  return state;
}

/** Looktime in seconden tussen point-index i en j, of null als matrix niet beschikbaar. */
export function lookupSeconds(
  matrix: MatrixState,
  i: number,
  j: number
): number | null {
  if (!matrix.durations) return null;
  const mi = matrix.matrixIndex[i];
  const mj = matrix.matrixIndex[j];
  if (mi == null || mj == null) return null;
  const row = matrix.durations[mi];
  if (!row) return null;
  const v = row[mj];
  return typeof v === "number" ? v : null;
}
