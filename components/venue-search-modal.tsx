"use client";

import { useState } from "react";
import type { LocationV2 } from "@core";

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
}

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

export function VenueSearchModal({ onClose, onAdd, existingSourceIds = [] }: Props) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("bar");
  const [results, setResults] = useState<VenueResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const res = await fetch(
        `/api/venues/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`
      );
      const data = (await res.json()) as { results?: VenueResult[]; query?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setResults([]);
        return;
      }
      setResults(data.results ?? []);
      setSearchedQuery(data.query ?? `${type} in ${q}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoeken mislukt.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(results.map((_, i) => i).filter((i) => !isDuplicate(results[i]))));
  }

  function isDuplicate(r: VenueResult): boolean {
    return Boolean(r.sourceId && existingSourceIds.includes(r.sourceId));
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
        style={{ width: "min(820px, 100%)", maxHeight: "85vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Zoek kroegen</h3>
          <button type="button" className="btn-sm btn-ghost" onClick={onClose}>Sluit</button>
        </div>

        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              placeholder="Stad of postcode (bv. Amsterdam, 1012JS)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
              style={{ flex: "1 1 240px" }}
              autoFocus
            />
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ minWidth: 120 }}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button type="button" className="btn-sm" onClick={runSearch} disabled={loading || !query.trim()}>
              {loading ? "Zoeken…" : "Zoeken"}
            </button>
          </div>
          {searchedQuery && !error && (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Resultaten voor: <code>{searchedQuery}</code>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {results.length} gevonden — {selected.size} geselecteerd
              </span>
              <button type="button" className="btn-sm btn-ghost" onClick={selectAll}>
                Selecteer alles
              </button>
            </div>

            <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              {results.map((r, i) => {
                const dup = isDuplicate(r);
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
                      <div style={{ fontWeight: 500 }}>
                        {r.name}
                        {dup && <span className="muted" style={{ marginLeft: 8, fontSize: "0.8rem" }}>(al toegevoegd)</span>}
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
