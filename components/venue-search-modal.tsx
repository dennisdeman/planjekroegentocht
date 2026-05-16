"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { LocationV2 } from "@core";
import { VENUE_TYPE_BADGES } from "@lib/venue-type-badge";
import type { MapVenue } from "@ui/venue-search-map";

const VenueSearchMap = dynamic(
  () => import("@ui/venue-search-map").then((m) => m.VenueSearchMap),
  { ssr: false, loading: () => <div style={{ height: 450, display: "grid", placeItems: "center", border: "1px solid var(--line, #e2e6ec)", borderRadius: 6 }}><span className="muted">Kaart laden…</span></div> }
);

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
  _searchType?: string;
}

const TYPE_BADGES = VENUE_TYPE_BADGES;

interface Props {
  onClose: () => void;
  onAdd: (venues: Omit<LocationV2, "id">[]) => void;
  existingSourceIds?: string[];
  /** Bestaande kroegen uit de huidige config — getoond als grijs-genummerde markers op de kaart en in de route. */
  existingLocations?: LocationV2[];
  /** Cache-key (typisch config-id) zodat modal-state per config gescheiden blijft binnen één page-load. */
  cacheKey?: string;
}

/**
 * Module-level cache. Houdt de state van de modal vast tussen close/open
 * binnen dezelfde page-load (verloren bij refresh — geen localStorage nodig).
 * Per `cacheKey` (typisch config.id) zodat verschillende configs niet leaken.
 */
interface ModalStateCache {
  query: string;
  results: VenueResult[];
  searchedQuery: string | null;
  page: number;
  reachedEnd: boolean;
  selectionOrder: string[];
  venueCache: Record<string, VenueResult>;
  selectedTypes: string[];
  maxRadius: number;
  pickCount: number;
}
const modalStateCaches: Record<string, ModalStateCache> = {};
const DEFAULT_CACHE_KEY = "__default__";

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

/**
 * Nearest-neighbour reordering: start bij eerste item, kies steeds de
 * dichtsbijzijnde nog-niet-bezochte. Goedkope TSP-heuristiek; voor <10
 * kroegen in de praktijk vrijwel altijd binnen 5% van het globale optimum.
 */
function nearestNeighbourOrder(
  startId: string,
  pool: Array<{ id: string; lat: number; lng: number }>
): string[] {
  if (pool.length <= 2) return pool.map((p) => p.id);
  const remaining = new Set(pool.map((p) => p.id));
  const startNode = pool.find((p) => p.id === startId) ?? pool[0];
  const out: string[] = [startNode.id];
  remaining.delete(startNode.id);
  let current = startNode;
  while (remaining.size > 0) {
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const id of remaining) {
      const c = pool.find((p) => p.id === id);
      if (!c) continue;
      const d = haversineMeters({ lat: current.lat, lng: current.lng }, { lat: c.lat, lng: c.lng });
      if (d < bestDist) {
        bestDist = d;
        bestId = c.id;
      }
    }
    if (bestId === null) break;
    out.push(bestId);
    remaining.delete(bestId);
    current = pool.find((p) => p.id === bestId)!;
  }
  return out;
}

/** Stabiele key voor selectie over zoekopdrachten heen — overleeft results-array vervangen. */
function venueKey(r: VenueResult): string {
  return r.sourceId ?? `${r.name}|${r.address ?? ""}`;
}

export function VenueSearchModal({ onClose, onAdd, existingSourceIds = [], existingLocations = [], cacheKey }: Props) {
  // Init state vanuit module-cache als die bestaat (modal-reopen binnen dezelfde page-sessie).
  // selectionOrder wordt gefilterd zodat reeds-toegevoegde kroegen niet dubbel "geselecteerd" blijven.
  const cacheKeyEff = cacheKey ?? DEFAULT_CACHE_KEY;
  const cache = modalStateCaches[cacheKeyEff];
  const existingSet = useMemo(() => new Set(existingSourceIds), [existingSourceIds]);

  const [query, setQuery] = useState(() => cache?.query ?? "");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    () => new Set(cache?.selectedTypes ?? TYPES.map((t) => t.value))
  );
  const [results, setResults] = useState<VenueResult[]>(() => cache?.results ?? []);
  /** Selectie-volgorde via keys (eerst geklikt = positie 0). Bepaalt route + cijfers. */
  const [selectionOrder, setSelectionOrder] = useState<string[]>(() => {
    const restored = cache?.selectionOrder ?? [];
    // Filter keys die nu al in de config zitten (door sourceId match) zodat ze niet dubbel tellen.
    return restored.filter((k) => !existingSet.has(k));
  });
  /** Cache van alle ooit-geselecteerde venues — overleeft nieuwe zoekopdrachten. */
  const [venueCache, setVenueCache] = useState<Record<string, VenueResult>>(() => cache?.venueCache ?? {});
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(() => cache?.searchedQuery ?? null);
  const [page, setPage] = useState(() => cache?.page ?? 1);
  const [reachedEnd, setReachedEnd] = useState(() => cache?.reachedEnd ?? false);
  const [maxRadius, setMaxRadius] = useState<number>(() => cache?.maxRadius ?? 700);
  const [pickCount, setPickCount] = useState<number>(() => cache?.pickCount ?? 6);
  const [routeGeo, setRouteGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const selectedKeys = useMemo(() => new Set(selectionOrder), [selectionOrder]);

  /** Lookup van key → VenueResult: huidige resultaten + existing config-locations hebben voorrang, dan cache. */
  const venueByKey: Record<string, VenueResult> = useMemo(() => {
    const out: Record<string, VenueResult> = { ...venueCache };
    for (const r of results) out[venueKey(r)] = r;
    // existingAsVenues toevoegen na results zodat config-data niet overschreven wordt door stale cache.
    // Hieronder gedefinieerd via existingLocations — herhaal logic om TDZ te vermijden.
    for (const l of existingLocations) {
      if (l.lat == null || l.lng == null) continue;
      const k = l.sourceId ?? `existing:${l.id}`;
      out[k] = {
        name: l.name,
        address: l.address ?? null,
        lat: l.lat,
        lng: l.lng,
        phone: l.phone ?? null,
        website: l.website ?? null,
        rating: l.rating ?? null,
        reviewCount: l.reviewCount ?? null,
        priceLevel: l.priceLevel ?? null,
        category: l.category ?? null,
        sourceId: l.sourceId ?? `existing:${l.id}`,
        _searchType: l.venueType,
      };
    }
    return out;
  }, [venueCache, results, existingLocations]);

  // Bestaande config-kroegen (met sourceId + coords): omgezet naar VenueResult-vorm
  // zodat we ze net als zoek-resultaten kunnen renderen op de kaart en in de route.
  const existingAsVenues: VenueResult[] = useMemo(() => {
    return existingLocations
      .filter((l): l is LocationV2 & { lat: number; lng: number } => l.lat != null && l.lng != null)
      .map((l) => ({
        name: l.name,
        address: l.address ?? null,
        lat: l.lat,
        lng: l.lng,
        phone: l.phone ?? null,
        website: l.website ?? null,
        rating: l.rating ?? null,
        reviewCount: l.reviewCount ?? null,
        priceLevel: l.priceLevel ?? null,
        category: l.category ?? null,
        sourceId: l.sourceId ?? `existing:${l.id}`,
        _searchType: l.venueType,
      }));
  }, [existingLocations]);

  /** Keys van bestaande config-kroegen (in config-volgorde). Vormen het begin van de route. */
  const existingKeys: string[] = useMemo(() => existingAsVenues.map(venueKey), [existingAsVenues]);

  /** Volledige route-volgorde voor map-numbering: bestaande eerst, dan nieuwe selecties. */
  const fullRouteOrder: string[] = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of existingKeys) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    for (const k of selectionOrder) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }, [existingKeys, selectionOrder]);

  /** Save module-cache on unmount (modal close). */
  const stateRef = useRef({ query, results, searchedQuery, page, reachedEnd, selectionOrder, venueCache, selectedTypes, maxRadius, pickCount });
  stateRef.current = { query, results, searchedQuery, page, reachedEnd, selectionOrder, venueCache, selectedTypes, maxRadius, pickCount };
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      modalStateCaches[cacheKeyEff] = {
        query: s.query,
        results: s.results,
        searchedQuery: s.searchedQuery,
        page: s.page,
        reachedEnd: s.reachedEnd,
        selectionOrder: s.selectionOrder,
        venueCache: s.venueCache,
        selectedTypes: Array.from(s.selectedTypes),
        maxRadius: s.maxRadius,
        pickCount: s.pickCount,
      };
    };
  }, [cacheKeyEff]);

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return next;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

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
    // BELANGRIJK: selectionOrder + venueCache blijven staan zodat eerdere
    // selecties (bv. andere stad) niet verdwijnen bij een nieuwe zoek.
    setReachedEnd(false);
    setPage(1);
    const first = await fetchPageAllTypes(1);
    if (first !== null) {
      setResults(first);
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

  const displayedIndices: number[] = useMemo(() => {
    return sortedIndices.filter((i) => {
      const t = results[i]?._searchType;
      return t ? selectedTypes.has(t) : true;
    });
  }, [sortedIndices, results, selectedTypes]);

  const hiddenSelectedCount = useMemo(() => {
    let n = 0;
    for (const k of selectionOrder) {
      const r = venueByKey[k];
      const t = r?._searchType;
      if (t && !selectedTypes.has(t)) n++;
    }
    return n;
  }, [selectionOrder, venueByKey, selectedTypes]);

  function toggleVenue(r: VenueResult) {
    const key = venueKey(r);
    // Cache de venue zodat 'ie zichtbaar blijft als de results-array verandert.
    setVenueCache((prev) => (prev[key] === r ? prev : { ...prev, [key]: r }));
    setSelectionOrder((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  }

  function toggleByKey(key: string) {
    const r = venueByKey[key];
    if (!r) return;
    toggleVenue(r);
  }

  function isDuplicate(r: VenueResult): boolean {
    return Boolean(r.sourceId && existingSourceIds.includes(r.sourceId));
  }

  const userAnchorKey: string | null = useMemo(() => {
    if (selectionOrder.length === 0) return null;
    for (const k of selectionOrder) {
      const r = venueByKey[k];
      if (r && r.lat != null && r.lng != null) return k;
    }
    return null;
  }, [selectionOrder, venueByKey]);

  const userAnchorName: string | null =
    userAnchorKey != null ? venueByKey[userAnchorKey]?.name ?? null : null;

  /** Existing-in-config venues met coords — gebruikt als anker-pool wanneer er nog geen user-anker is. */
  const existingAnchors: VenueResult[] = useMemo(() => existingAsVenues, [existingAsVenues]);

  /** Hoeveel NIEUWE venues moeten we kiezen om totaal `pickCount` te halen? */
  const newSlots = Math.max(0, pickCount - existingAnchors.length - selectionOrder.length);

  /** Knop disabled wanneer er geen plek meer is voor nieuwe venues, of als de user-anker geen coords heeft. */
  const clusterButtonDisabled =
    (selectionOrder.length > 0 && userAnchorKey == null) ||
    newSlots === 0;

  function pickClosestCluster() {
    const candidates = displayedIndices
      .map((i) => results[i])
      .filter((r): r is VenueResult => Boolean(r) && r.lat != null && r.lng != null && !isDuplicate(r));
    if (candidates.length === 0) return;
    if (newSlots === 0) return;

    // Bepaal welke venues we als anker-pool gebruiken (bron-punten waarvanaf we afstanden meten):
    //  - existing config-kroegen (immer onderdeel van de route)
    //  - eerder geselecteerde nieuwe venues (als de gebruiker handmatig al iets heeft gekozen)
    //  - of, als beide pools leeg zijn: het densest cafe in de huidige resultaten
    const anchorPool: VenueResult[] = [...existingAnchors];
    for (const k of selectionOrder) {
      const r = venueByKey[k];
      if (r && r.lat != null && r.lng != null) anchorPool.push(r);
    }
    if (anchorPool.length === 0) {
      const sortedCand = [...candidates].sort((a, b) => {
        const ai = results.indexOf(a);
        const bi = results.indexOf(b);
        const dDiff = (densityScores[bi] ?? 0) - (densityScores[ai] ?? 0);
        if (dDiff !== 0) return dDiff;
        return (b.rating ?? 0) - (a.rating ?? 0);
      });
      anchorPool.push(sortedCand[0]);
    }

    // Voor elke candidate: afstand = minimum afstand tot enige anker
    // (zo blijft de hele route compact — nieuwe venues sluiten aan op de bestaande cluster).
    const anchorKeys = new Set(anchorPool.map(venueKey));
    const ranked = candidates
      .filter((r) => !anchorKeys.has(venueKey(r)))
      .map((r) => {
        let minDist = Infinity;
        for (const a of anchorPool) {
          const d = haversineMeters({ lat: a.lat!, lng: a.lng! }, { lat: r.lat!, lng: r.lng! });
          if (d < minDist) minDist = d;
        }
        return { r, dist: minDist };
      })
      .sort((a, b) => a.dist - b.dist);
    const newPicks = ranked.slice(0, newSlots).map((x) => x.r);
    if (newPicks.length === 0) return;

    setVenueCache((prev) => {
      const next = { ...prev };
      for (const v of newPicks) next[venueKey(v)] = v;
      return next;
    });
    // Voeg toe aan bestaande selectionOrder (niet vervangen) — existing blijven onaangeroerd.
    setSelectionOrder((prev) => [...prev, ...newPicks.map(venueKey)]);
  }

  function clearSelection() {
    setSelectionOrder([]);
  }

  function optimizeOrder() {
    const pool = selectionOrder
      .map((k) => {
        const r = venueByKey[k];
        if (!r || r.lat == null || r.lng == null) return null;
        return { id: k, lat: r.lat, lng: r.lng };
      })
      .filter((v): v is { id: string; lat: number; lng: number } => v !== null);
    if (pool.length < 3) return;
    const reordered = nearestNeighbourOrder(pool[0].id, pool);
    const noCoords = selectionOrder.filter((k) => {
      const r = venueByKey[k];
      return !r || r.lat == null || r.lng == null;
    });
    setSelectionOrder([...reordered, ...noCoords]);
  }

  function addSelected() {
    const chosen = selectionOrder
      .map((k) => venueByKey[k])
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

  // Map-venues: existing config-kroegen + huidige zoek-resultaten (na type-filter)
  // + cached selecties die niet in current results zitten. Existing krijgen
  // `isExistingInConfig` zodat de map ze grijs-genummerd rendert + niet-klikbaar.
  const mapVenues: MapVenue[] = useMemo(() => {
    const seen = new Set<string>();
    const out: MapVenue[] = [];
    for (const v of existingAsVenues) {
      const k = venueKey(v);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        key: k,
        name: v.name,
        address: v.address,
        lat: v.lat!,
        lng: v.lng!,
        searchType: v._searchType,
        isDuplicate: false,
        isExistingInConfig: true,
      });
    }
    for (const i of displayedIndices) {
      const r = results[i];
      if (!r || r.lat == null || r.lng == null) continue;
      const k = venueKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        key: k,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        searchType: r._searchType,
        isDuplicate: isDuplicate(r),
      });
    }
    for (const k of selectionOrder) {
      if (seen.has(k)) continue;
      const r = venueByKey[k];
      if (!r || r.lat == null || r.lng == null) continue;
      seen.add(k);
      out.push({
        key: k,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        searchType: r._searchType,
        isDuplicate: isDuplicate(r),
        fromPreviousSearch: true,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedIndices, selectionOrder, results, venueByKey, existingAsVenues, existingSourceIds]);

  /** Selecties (new) die niet in de huidige zoekresultaten voorkomen — voor het bonus-paneel.
   *  Positie = positie in `fullRouteOrder` (zodat het cijfer overeenkomt met de marker). */
  const previouslySelectedVenues = useMemo(() => {
    const currentKeys = new Set(results.map(venueKey));
    const out: Array<{ key: string; venue: VenueResult; position: number }> = [];
    selectionOrder.forEach((k) => {
      if (currentKeys.has(k)) return;
      const r = venueByKey[k];
      if (!r) return;
      const position = fullRouteOrder.indexOf(k);
      out.push({ key: k, venue: r, position });
    });
    return out;
  }, [selectionOrder, results, venueByKey, fullRouteOrder]);

  // Live ORS-route bij elke selectie-change (debounced).
  // Coords-volgorde: existing-config-kroegen eerst, dan nieuwe selecties.
  useEffect(() => {
    const coordsList: [number, number][] = fullRouteOrder
      .map((k) => venueByKey[k])
      .filter((r): r is VenueResult => Boolean(r) && r.lat != null && r.lng != null)
      .map((r) => [r.lng!, r.lat!] as [number, number]);
    if (coordsList.length < 2) {
      setRouteGeo(null);
      setRouteError(null);
      setRouteLoading(false);
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/route-directions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coords: coordsList }),
        });
        const data = (await res.json().catch(() => null)) as
          | (GeoJSON.FeatureCollection & { error?: string })
          | { error: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !data || "error" in data) {
          const errMsg = data && "error" in data && data.error ? data.error : `HTTP ${res.status}`;
          setRouteGeo(null);
          setRouteError(errMsg);
          setRouteLoading(false);
          return;
        }
        setRouteGeo(data as GeoJSON.FeatureCollection);
        setRouteLoading(false);
      } catch (e) {
        if (cancelled) return;
        setRouteGeo(null);
        setRouteError(e instanceof Error ? e.message : "Onbekende fout");
        setRouteLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fullRouteOrder.join("|"), venueByKey]);

  // Total summary uit ORS-response
  const routeSummary: { distance: number; duration: number } | null = useMemo(() => {
    if (!routeGeo) return null;
    const feature = routeGeo.features?.[0];
    if (!feature) return null;
    const props = feature.properties as { summary?: { distance?: number; duration?: number } } | undefined;
    if (!props?.summary || typeof props.summary.distance !== "number" || typeof props.summary.duration !== "number") return null;
    return { distance: props.summary.distance, duration: props.summary.duration };
  }, [routeGeo]);

  function formatDuration(seconds: number): string {
    const min = Math.round(seconds / 60);
    return `${min} min`;
  }
  function formatDistance(meters: number): string {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  }

  return (
    <div
      className="help-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="help-modal-card"
        style={{ width: "min(1280px, 100%)", maxHeight: "90vh", overflow: "auto" }}
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
                {displayedIndices.length} van {results.length} getoond — {selectionOrder.length} geselecteerd
                {hiddenSelectedCount > 0 ? ` (${hiddenSelectedCount} verborgen door type-filter)` : ""}
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={pickClosestCluster}
                  disabled={clusterButtonDisabled}
                  title={
                    newSlots === 0
                      ? `Je hebt al ${existingAnchors.length + selectionOrder.length} kroegen ≥ doel (${pickCount}). Verhoog "Aantal te selecteren" om meer toe te voegen.`
                      : (selectionOrder.length > 0 && userAnchorKey == null)
                        ? "Anker heeft geen coördinaten — selecteer een café met locatiedata"
                        : existingAnchors.length + selectionOrder.length > 0
                          ? `Voegt ${newSlots} nieuwe kroeg${newSlots > 1 ? "en" : ""} toe dichtbij de bestaande cluster (totaal ${pickCount})`
                          : `Pakt de ${pickCount} dichtstbijzijnde kroegen rond het meest centrale café`
                  }
                >
                  {newSlots === 0
                    ? `✓ ${pickCount} kroegen geselecteerd`
                    : existingAnchors.length + selectionOrder.length > 0
                      ? `📍 Top ${pickCount} (+${newSlots} nieuwe)`
                      : `📍 Top ${pickCount} nabij elkaar`}
                </button>
                {selectionOrder.length >= 3 && (
                  <button
                    type="button"
                    className="btn-sm btn-ghost"
                    onClick={optimizeOrder}
                    title="Herorder selectie via nearest-neighbour — kortste totaal-route via huidige selectie"
                  >
                    🪄 Optimaliseer volgorde
                  </button>
                )}
                {selectionOrder.length > 0 && (
                  <button type="button" className="btn-sm btn-ghost" onClick={clearSelection}>
                    Wis selectie
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(360px, 0.9fr) minmax(420px, 1.1fr)",
                gap: 12,
                marginBottom: 12,
              }}
            >
              {/* Kaart-kolom */}
              <div style={{ position: "relative" }}>
                <VenueSearchMap
                  venues={mapVenues}
                  selectionOrder={fullRouteOrder}
                  hoveredKey={hoveredKey}
                  routeGeo={routeGeo}
                  onToggle={toggleByKey}
                  onHoverChange={setHoveredKey}
                  height={500}
                />
                {/* Route-stats overlay */}
                {(routeSummary || routeLoading || routeError) && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 10,
                      left: 10,
                      background: "rgba(255,255,255,0.95)",
                      border: "1px solid var(--line, #e2e6ec)",
                      borderRadius: 6,
                      padding: "8px 12px",
                      fontSize: "0.85rem",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                      zIndex: 1000,
                      maxWidth: "calc(100% - 20px)",
                    }}
                  >
                    {routeLoading && <span className="muted">Route berekenen…</span>}
                    {routeError && !routeLoading && (
                      <span style={{ color: "#b91c1c" }}>Route-fout: {routeError}</span>
                    )}
                    {routeSummary && !routeLoading && !routeError && (
                      <>
                        <strong>🚶 {formatDuration(routeSummary.duration)} · {formatDistance(routeSummary.distance)}</strong>
                        <span className="muted"> · {fullRouteOrder.length} kroegen</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Lijst-kolom */}
              <div style={{ maxHeight: 500, overflowY: "auto", display: "grid", gap: 6 }}>
                {previouslySelectedVenues.length > 0 && (
                  <div
                    style={{
                      padding: 8,
                      border: "1px dashed #16a34a",
                      background: "rgba(22,163,74,0.04)",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong style={{ fontSize: "0.85rem" }}>
                        🔖 Uit eerdere zoekopdracht ({previouslySelectedVenues.length})
                      </strong>
                      <button
                        type="button"
                        className="btn-sm btn-ghost"
                        style={{ fontSize: "0.75rem" }}
                        onClick={() => {
                          const keepKeys = new Set(results.map(venueKey));
                          setSelectionOrder((prev) => prev.filter((k) => keepKeys.has(k)));
                        }}
                        title="Verwijder alle selecties uit eerdere zoekopdrachten"
                      >
                        Wis eerdere
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {previouslySelectedVenues.map(({ key, venue: r, position }) => {
                        const typeBadge = r._searchType ? TYPE_BADGES[r._searchType] : null;
                        const isHovered = hoveredKey === key;
                        return (
                          <div
                            key={key}
                            onMouseEnter={() => setHoveredKey(key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "auto 1fr auto",
                              gap: 8,
                              padding: "6px 8px",
                              borderRadius: 6,
                              background: isHovered ? "rgba(29,78,216,0.06)" : "rgba(255,255,255,0.7)",
                              border: isHovered ? "1px solid #1d4ed8" : "1px solid transparent",
                              fontSize: "0.85rem",
                              alignItems: "center",
                              cursor: "pointer",
                            }}
                            onClick={() => toggleByKey(key)}
                          >
                            <div
                              aria-hidden
                              style={{
                                width: 22, height: 22, borderRadius: "50%",
                                background: "#16a34a", color: "#fff",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 600,
                              }}
                            >
                              {position + 1}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                                {typeBadge && (
                                  <span style={{ fontSize: "0.7rem", padding: "1px 5px", borderRadius: 4, background: typeBadge.bg, color: typeBadge.fg }}>
                                    {typeBadge.icon}
                                  </span>
                                )}
                                <span style={{ fontWeight: 500 }}>{r.name}</span>
                              </div>
                              <div className="muted" style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.address ?? "geen adres"}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn-sm btn-ghost"
                              style={{ fontSize: "0.75rem", padding: "2px 6px" }}
                              onClick={(e) => { e.stopPropagation(); toggleByKey(key); }}
                              title="Verwijder uit selectie"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {displayedIndices.map((i) => {
                  const r = results[i];
                  const k = venueKey(r);
                  const dup = isDuplicate(r);
                  const density = densityScores[i];
                  const hasCoords = r.lat != null && r.lng != null;
                  const typeBadge = r._searchType ? TYPE_BADGES[r._searchType] : null;
                  const isSelected = selectedKeys.has(k);
                  // Existing-in-config (dup) staan ook in fullRouteOrder → toon hun nummer ook.
                  const indexInRoute = fullRouteOrder.indexOf(k);
                  const positionInRoute = indexInRoute >= 0 ? indexInRoute + 1 : null;
                  const isHovered = hoveredKey === k;
                  return (
                    <label
                      key={k}
                      onMouseEnter={() => setHoveredKey(k)}
                      onMouseLeave={() => setHoveredKey(null)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 10,
                        padding: 10,
                        border: isHovered
                          ? "1px solid #1d4ed8"
                          : isSelected
                            ? "1px solid #16a34a"
                            : "1px solid var(--line, #e2e6ec)",
                        borderRadius: 8,
                        background: dup
                          ? "rgba(0,0,0,0.04)"
                          : isSelected
                            ? "rgba(22,163,74,0.06)"
                            : isHovered
                              ? "rgba(29,78,216,0.04)"
                              : "transparent",
                        cursor: dup ? "not-allowed" : "pointer",
                        opacity: dup ? 0.6 : 1,
                        transition: "border-color 0.1s, background 0.1s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 28 }}>
                        {positionInRoute !== null ? (
                          <div
                            aria-hidden
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              // Grijs voor existing-in-config (dup), groen voor nieuwe selecties.
                              // Matcht de marker-kleur op de kaart.
                              background: dup ? "#6b7280" : "#16a34a",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                            title={dup ? `Stop ${positionInRoute} (al in configuratie)` : `Stop ${positionInRoute} in route`}
                          >
                            {positionInRoute}
                          </div>
                        ) : (
                          <input
                            type="checkbox"
                            checked={false}
                            disabled={dup}
                            onChange={() => toggleVenue(r)}
                          />
                        )}
                      </div>
                      <div onClick={(e) => { if (!dup) { e.preventDefault(); toggleVenue(r); } }}>
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
                {!reachedEnd && page < MAX_PAGES && (
                  <div style={{ textAlign: "center", margin: "8px 0" }}>
                    <button type="button" className="btn-sm btn-ghost" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Laden…" : `📥 Meer laden (pagina ${page + 1})`}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-sm btn-ghost" onClick={onClose}>Annuleer</button>
              <button type="button" className="btn-sm" onClick={addSelected} disabled={selectionOrder.length === 0}>
                Voeg {selectionOrder.length} toe als locaties
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
