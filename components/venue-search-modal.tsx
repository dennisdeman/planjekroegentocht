"use client";

import { useMemo, useState } from "react";
import type { LocationV2 } from "@core";
import { VENUE_TYPE_BADGES } from "@lib/venue-type-badge";

interface VenueResult {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  category: string | null;
  sourceId: string | null;
  /** Welke type-zoekopdracht dit resultaat eerst opleverde (bar/pub/cafe/nightclub). */
  _searchType?: string;
}

const TYPE_BADGES = VENUE_TYPE_BADGES;

interface Props {
  onClose: () => void;
  onAdd: (venues: Omit<LocationV2, "id">[]) => void;
  existingSourceIds?: string[];
}

const TYPES: Array<{ value: string; label: string }> = [
  { value: "bar", label: "Bars" },
  { value: "pub", label: "Pubs" },
  { value: "cafe", label: "Cafés" },
  { value: "nightclub", label: "Nightclubs" },
];

const MAX_PAGES = 5;

const RADIUS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 400, label: "Dichtbij (≤400m, ~5 min)" },
  { value: 700, label: "Gemiddeld (≤700m, ~8 min)" },
  { value: 1200, label: "Verder (≤1.2km, ~14 min)" },
  { value: Infinity, label: "Geen limiet" },
];

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function VenueSearchModal({ onClose, onAdd, existingSourceIds = [] }: Props) {
  const [query, setQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    () => new Set(TYPES.map((t) => t.value))
  );
  const [results, setResults] = useState<VenueResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [maxRadius, setMaxRadius] = useState<number>(700);
  const [pickCount, setPickCount] = useState<number>(6);

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return next; // niet alle uit
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  /**
   * Haal voor de huidige `query` parallel alle TYPES op (één Serper-call per type).
   * Resultaten worden gedeed-upliceerd op sourceId; bij dubbel behouden we de eerste
   * (`_searchType` van eerste hit). Geeft een merged lijst terug.
   */
  async function fetchPageAllTypes(p: number): Promise<VenueResult[] | null> {
    const q = query.trim();
    if (!q) return null;
    try {
      const calls = TYPES.map((t) =>
        fetch(`/api/venues/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(t.value)}&page=${p}`)
          .then((res) => res.json().then((data) => ({ res, data, type: t.value })))
      );
      const responses = await Promise.all(calls);
      const merged: VenueResult[] = [];
      const seenKeys = new Set<string>();
      let anyError: string | null = null;
      let firstQuery: string | null = null;
      for (const { res, data, type } of responses) {
        const d = data as { results?: VenueResult[]; query?: string; error?: string };
        if (!res.ok) {
          anyError = anyError ?? d.error ?? `HTTP ${res.status}`;
          continue;
        }
        firstQuery ??= d.query ?? null;
        for (const r of d.results ?? []) {
          const key = r.sourceId ?? `${r.name}|${r.address ?? ""}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          merged.push({ ...r, _searchType: type });
        }
      }
      if (anyError && merged.length === 0) {
        setError(anyError);
        return null;
      }
      if (p === 1) setSearchedQuery(firstQuery ?? `kroegen in ${q}`);
      return merged;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoeken mislukt.");
      return null;
    }
  }

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setReachedEnd(false);
    setPage(1);
    const first = await fetchPageAllTypes(1);
    if (first !== null) {
      setResults(first);
      // 4 types × 10 = max 40 per page; <20 betekent we naderen einde.
      if (first.length < 20) setReachedEnd(true);
    } else {
      setResults([]);
    }
    setLoading(false);
  }

  async function loadMore() {
    if (loadingMore || reachedEnd || page >= MAX_PAGES) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const more = await fetchPageAllTypes(nextPage);
    if (more) {
      const seen = new Set(results.map((r) => r.sourceId ?? `${r.name}|${r.address ?? ""}`));
      const fresh = more.filter((r) => !seen.has(r.sourceId ?? `${r.name}|${r.address ?? ""}`));
      setResults([...results, ...fresh]);
      setPage(nextPage);
      if (fresh.length < 20 || nextPage >= MAX_PAGES) setReachedEnd(true);
    }
    setLoadingMore(false);
  }

  /**
   * Per resultaat: hoeveel anderen liggen er binnen maxRadius hemelsbreed?
   * (Density = aantal "buren". Hoger = meer centraal in een cluster.)
   */
  const densityScores: number[] = useMemo(() => {
    return results.map((r, i) => {
      if (r.lat == null || r.lng == null) return -1;
      let count = 0;
      for (let j = 0; j < results.length; j++) {
        if (i === j) continue;
        const o = results[j];
        if (o.lat == null || o.lng == null) continue;
        const d = haversineMeters({ lat: r.lat!, lng: r.lng! }, { lat: o.lat, lng: o.lng });
        if (d <= maxRadius) count++;
      }
      return count;
    });
  }, [results, maxRadius]);

  /** Sort-volgorde: density desc, dan rating desc, dan original order. */
  const sortedIndices: number[] = useMemo(() => {
    const idx = results.map((_, i) => i);
    idx.sort((a, b) => {
      const da = densityScores[a];
      const db = densityScores[b];
      if (db !== da) return db - da;
      const ra = results[a].rating ?? 0;
      const rb = results[b].rating ?? 0;
      if (rb !== ra) return rb - ra;
      return a - b;
    });
    return idx;
  }, [results, densityScores]);

  /** Indices die zichtbaar zijn op basis van type-filter. */
  const displayedIndices: number[] = useMemo(() => {
    return sortedIndices.filter((i) => {
      const t = results[i]?._searchType;
      return t ? selectedTypes.has(t) : true;
    });
  }, [sortedIndices, results, selectedTypes]);

  /** Hoeveel geselecteerde items verborgen worden door huidige type-filter. */
  const hiddenSelectedCount = useMemo(() => {
    let n = 0;
    for (const i of selected) {
      const t = results[i]?._searchType;
      if (t && !selectedTypes.has(t)) n++;
    }
    return n;
  }, [selected, results, selectedTypes]);

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function isDuplicate(r: VenueResult): boolean {
    return Boolean(r.sourceId && existingSourceIds.includes(r.sourceId));
  }

  /**
   * Bepaal het anker voor de cluster-selectie:
   *  - als de gebruiker al iets met coords heeft geselecteerd: eerste-geselecteerde
   *  - anders: het café met de hoogste density-score
   */
  const userAnchorIdx: number | null = useMemo(() => {
    if (selected.size === 0) return null;
    // Volgorde van Set is insertion-order — eerste klik = eerste in Set.
    for (const i of selected) {
      const r = results[i];
      if (r && r.lat != null && r.lng != null) return i;
    }
    return null;
  }, [selected, results]);

  const userAnchorName: string | null = userAnchorIdx != null ? results[userAnchorIdx]?.name ?? null : null;

  /** Disable de knop als gebruiker iets geselecteerd heeft maar niets met coords (anker mist). */
  const clusterButtonDisabled =
    selected.size > 0 && userAnchorIdx == null;

  /**
   * Selecteer N cafés die hemelsbreed dicht bij elkaar liggen.
   * Strategie: anker = user-keuze (eerste geselecteerde met coords) of densest,
   * voeg N-1 dichtsbijzijnde toe uit de gefilterde pool (type-filter geldt).
   */
  function pickClosestCluster() {
    // Kandidaten uit gefilterde pool (type-checkboxes bepalen welke types meedoen)
    const candidates = displayedIndices
      .map((i) => ({ r: results[i], i }))
      .filter(({ r }) => r.lat != null && r.lng != null && !isDuplicate(r));
    if (candidates.length === 0) return;

    let anchor: { r: VenueResult; i: number };
    if (userAnchorIdx != null) {
      const r = results[userAnchorIdx];
      anchor = { r, i: userAnchorIdx };
    } else {
      // Anker: hoogste density-score
      const sortedCand = [...candidates].sort((a, b) => {
        const dDiff = (densityScores[b.i] ?? 0) - (densityScores[a.i] ?? 0);
        if (dDiff !== 0) return dDiff;
        const rDiff = (b.r.rating ?? 0) - (a.r.rating ?? 0);
        return rDiff;
      });
      anchor = sortedCand[0];
    }

    const others = candidates
      .filter((c) => c.i !== anchor.i)
      .map((c) => ({
        ...c,
        dist: haversineMeters(
          { lat: anchor.r.lat!, lng: anchor.r.lng! },
          { lat: c.r.lat!, lng: c.r.lng! }
        ),
      }))
      .sort((a, b) => a.dist - b.dist);
    const picked = [anchor, ...others.slice(0, Math.max(0, pickCount - 1))];
    setSelected(new Set(picked.map((p) => p.i)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function addSelected() {
    const chosen = Array.from(selected)
      .map((i) => results[i])
      .filter((r): r is VenueResult => Boolean(r));
    const venues: Omit<LocationV2, "id">[] = chosen.map((r) => ({
      name: r.name,
      address: r.address ?? undefined,
      lat: r.lat ?? undefined,
      lng: r.lng ?? undefined,
      phone: r.phone ?? undefined,
      website: r.website ?? undefined,
      rating: r.rating ?? undefined,
      reviewCount: r.reviewCount ?? undefined,
      priceLevel: r.priceLevel ?? undefined,
      category: r.category ?? undefined,
      sourceId: r.sourceId ?? undefined,
      venueType: r._searchType ?? undefined,
    }));
    onAdd(venues);
    onClose();
  }

  return (
    <div
      className="help-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="help-modal-card"
        style={{ width: "min(900px, 100%)", maxHeight: "85vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Zoek kroegen</h3>
          <button type="button" className="btn-sm btn-ghost" onClick={onClose}>Sluit</button>
        </div>

        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              placeholder="Stad of postcode (bv. Utrecht centrum)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
              style={{ flex: "1 1 240px" }}
              autoFocus
            />
            <button type="button" className="btn-sm" onClick={runSearch} disabled={loading || !query.trim()}>
              {loading ? "Zoeken…" : "Zoeken"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: "0.85rem", marginTop: 4 }}>
            <span className="muted">Toon:</span>
            {TYPES.map((t) => (
              <label key={t.value} style={{ display: "inline-flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectedTypes.has(t.value)}
                  onChange={() => toggleType(t.value)}
                />
                {TYPE_BADGES[t.value]?.icon} {t.label}
              </label>
            ))}
          </div>
          {searchedQuery && !error && (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Resultaten voor: <code>{searchedQuery}</code>
              {results.length > 0 ? ` — gesorteerd op cluster-centraliteit` : ""}
            </p>
          )}
        </div>

        {error && (
          <div className="notice notice-warning" style={{ marginBottom: 12 }}>
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                padding: 10,
                marginBottom: 12,
                background: "var(--surface-muted, #f7f7f7)",
                borderRadius: 6,
                fontSize: "0.85rem",
              }}
            >
              <label style={{ display: "grid", gap: 4 }}>
                <span className="muted">Cluster-radius</span>
                <select
                  value={maxRadius === Infinity ? "inf" : String(maxRadius)}
                  onChange={(e) => setMaxRadius(e.target.value === "inf" ? Infinity : Number(e.target.value))}
                >
                  {RADIUS_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value === Infinity ? "inf" : o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span className="muted">Aantal te selecteren</span>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={pickCount}
                  onChange={(e) => setPickCount(Math.max(2, Math.min(20, Number(e.target.value) || 6)))}
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {displayedIndices.length} van {results.length} getoond — {selected.size} geselecteerd
                {hiddenSelectedCount > 0 ? ` (${hiddenSelectedCount} verborgen door type-filter)` : ""}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={pickClosestCluster}
                  disabled={clusterButtonDisabled}
                  title={
                    clusterButtonDisabled
                      ? "Anker heeft geen coördinaten — selecteer een café met locatiedata"
                      : userAnchorName
                        ? `Vervangt selectie met '${userAnchorName}' + de ${pickCount - 1} dichtsbijzijnde cafés`
                        : "Pakt het meest centrale café + zijn dichtsbijzijnde buren"
                  }
                >
                  {userAnchorName
                    ? `📍 Top ${pickCount} nabij '${userAnchorName}'`
                    : `📍 Top ${pickCount} nabij elkaar`}
                </button>
                {selected.size > 0 && (
                  <button type="button" className="btn-sm btn-ghost" onClick={clearSelection}>
                    Wis selectie
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              {displayedIndices.map((i) => {
                const r = results[i];
                const dup = isDuplicate(r);
                const density = densityScores[i];
                const hasCoords = r.lat != null && r.lng != null;
                const typeBadge = r._searchType ? TYPE_BADGES[r._searchType] : null;
                return (
                  <label
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 10,
                      padding: 10,
                      border: "1px solid var(--line, #e2e6ec)",
                      borderRadius: 8,
                      background: dup ? "rgba(0,0,0,0.04)" : "transparent",
                      cursor: dup ? "not-allowed" : "pointer",
                      opacity: dup ? 0.6 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      disabled={dup}
                      onChange={() => toggle(i)}
                    />
                    <div>
                      <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {typeBadge && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: typeBadge.bg,
                              color: typeBadge.fg,
                            }}
                          >
                            {typeBadge.icon} {typeBadge.label}
                          </span>
                        )}
                        <span>{r.name}</span>
                        {dup && <span className="muted" style={{ fontSize: "0.8rem" }}>(al toegevoegd)</span>}
                        {hasCoords && density >= 3 ? (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: "0.7rem",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "#dcfce7",
                              color: "#166534",
                            }}
                          >
                            🎯 {density} dichtbij
                          </span>
                        ) : hasCoords && density >= 1 ? (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: "0.7rem",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "#fef3c7",
                              color: "#92400e",
                            }}
                          >
                            {density} dichtbij
                          </span>
                        ) : !hasCoords ? (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: "0.7rem",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "#f3f4f6",
                              color: "#666",
                            }}
                          >
                            geen coördinaten
                          </span>
                        ) : null}
                      </div>
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {r.address ?? "geen adres"}
                        {r.category && <> · {r.category}</>}
                        {r.priceLevel && <> · {r.priceLevel}</>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: "0.85rem" }}>
                      {r.rating !== null && (
                        <div>
                          <strong>{r.rating.toFixed(1)}⭐</strong>
                          {r.reviewCount !== null && <span className="muted"> ({r.reviewCount})</span>}
                        </div>
                      )}
                      {r.website && (
                        <a href={r.website} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: "0.8rem" }} onClick={(e) => e.stopPropagation()}>
                          website
                        </a>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {!reachedEnd && page < MAX_PAGES && (
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <button type="button" className="btn-sm btn-ghost" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Laden…" : `📥 Meer laden (pagina ${page + 1})`}
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-sm btn-ghost" onClick={onClose}>Annuleer</button>
              <button type="button" className="btn-sm" onClick={addSelected} disabled={selected.size === 0}>
                Voeg {selected.size} toe als locaties
              </button>
            </div>
          </>
        )}

        {!loading && results.length === 0 && !error && searchedQuery && (
          <p className="muted">Geen resultaten gevonden voor deze zoekopdracht.</p>
        )}
      </div>
    </div>
  );
}
