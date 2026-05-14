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
  onSave: (loc: Omit<LocationV2, "id">) => void;
  /** Pre-fill voor edit-mode. Niet aanwezig = nieuwe locatie. */
  initial?: Partial<Omit<LocationV2, "id">>;
}

export function ManualLocationModal({ onClose, onSave, initial }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [lat, setLat] = useState<string>(initial?.lat != null ? String(initial.lat) : "");
  const [lng, setLng] = useState<string>(initial?.lng != null ? String(initial.lng) : "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [reviewCount, setReviewCount] = useState<number | null>(initial?.reviewCount ?? null);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [sourceId, setSourceId] = useState<string | null>(initial?.sourceId ?? null);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const isEdit = Boolean(initial);

  const [searchResults, setSearchResults] = useState<VenueResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const latNum = lat.trim() ? Number(lat) : null;
  const lngNum = lng.trim() ? Number(lng) : null;
  const hasCoords =
    latNum !== null && lngNum !== null && Number.isFinite(latNum) && Number.isFinite(lngNum);
  const hasAddress = address.trim().length > 0;
  const canSave = name.trim().length > 0 && (hasAddress || hasCoords);

  async function runSearch() {
    const q = name.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      // Geen 'q=stad' maar 'q=naam' — Serper places werkt prima met naam-only.
      const res = await fetch(`/api/venues/search?q=${encodeURIComponent(q)}&type=bar`);
      const data = (await res.json()) as { results?: VenueResult[]; error?: string };
      if (!res.ok) {
        setSearchError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSearchResults(data.results ?? []);
      setSearched(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Zoeken mislukt.");
    } finally {
      setSearching(false);
    }
  }

  async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    // Nominatim reverse-geocode (gratis OSM). Polite use: 1 req/sec, User-Agent vereist.
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`,
        { headers: { "Accept-Language": "nl" } }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { display_name?: string; address?: Record<string, string> };
      if (data.display_name) return data.display_name;
      return null;
    } catch {
      return null;
    }
  }

  async function applyResult(r: VenueResult) {
    setName(r.name);
    setAddress(r.address ?? "");
    setLat(r.lat != null ? String(r.lat) : "");
    setLng(r.lng != null ? String(r.lng) : "");
    setPhone(r.phone ?? "");
    setWebsite(r.website ?? "");
    setRating(r.rating);
    setReviewCount(r.reviewCount);
    setCategory(r.category ?? "");
    setSourceId(r.sourceId);
    setSearchResults([]); // hide list after pick
    setSearched(false);

    // Serper geeft soms geen adres terug bij name-only zoekopdrachten —
    // probeer Nominatim reverse-geocode op de coords om alsnog een adres te krijgen.
    if (!r.address && r.lat != null && r.lng != null) {
      setReverseGeocoding(true);
      const addr = await reverseGeocode(r.lat, r.lng);
      if (addr) setAddress(addr);
      setReverseGeocoding(false);
    }
  }

  function handleSave() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      address: address.trim() || undefined,
      lat: hasCoords ? latNum! : undefined,
      lng: hasCoords ? lngNum! : undefined,
      phone: phone.trim() || undefined,
      website: website.trim() || undefined,
      rating: rating ?? undefined,
      reviewCount: reviewCount ?? undefined,
      category: category.trim() || undefined,
      sourceId: sourceId ?? undefined,
    });
    onClose();
  }

  return (
    <div
      className="help-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="help-modal-card"
        style={{ width: "min(640px, 100%)", maxHeight: "85vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{isEdit ? "Kroeg bewerken" : "Kroeg toevoegen"}</h3>
          <button type="button" className="btn-sm btn-ghost" onClick={onClose}>Sluit</button>
        </div>

        <div className="form-grid">
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}>Naam (verplicht)</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Café De Bok"
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runSearch(); } }}
              />
              <button type="button" className="btn-sm" onClick={runSearch} disabled={searching || !name.trim()}>
                {searching ? "Zoeken…" : "🔍 Zoek via Google"}
              </button>
            </div>
          </label>

          {searchError && (
            <div className="notice notice-warning" style={{ padding: 8 }}>
              <p style={{ margin: 0, fontSize: "0.85rem" }}>{searchError}</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div style={{ display: "grid", gap: 6, padding: 8, background: "rgba(0,0,0,0.03)", borderRadius: 6 }}>
              <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
                {searchResults.length} resultaat{searchResults.length !== 1 ? "en" : ""} — klik om gegevens over te nemen, of vul handmatig in.
              </p>
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyResult(r)}
                  style={{
                    textAlign: "left",
                    padding: 8,
                    background: "white",
                    border: "1px solid var(--line, #e2e6ec)",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    {r.address ?? "geen adres"}
                    {r.rating != null && <> · {r.rating.toFixed(1)}⭐{r.reviewCount ? ` (${r.reviewCount})` : ""}</>}
                    {r.category && <> · {r.category}</>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {searched && searchResults.length === 0 && !searchError && (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Niet gevonden via Google — vul de gegevens handmatig in.
            </p>
          )}

          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Adres {!hasCoords && <em style={{ color: "var(--danger, #c33)" }}>(verplicht zonder lat/lng)</em>}
              {reverseGeocoding && <span style={{ marginLeft: 6 }}>· adres ophalen…</span>}
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Hoofdstraat 12, 1234 AB Amsterdam"
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                Latitude {!hasAddress && <em style={{ color: "var(--danger, #c33)" }}>(verplicht)</em>}
              </span>
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="52.377712"
                inputMode="decimal"
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                Longitude {!hasAddress && <em style={{ color: "var(--danger, #c33)" }}>(verplicht)</em>}
              </span>
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="4.895039"
                inputMode="decimal"
              />
            </label>
          </div>

          <details style={{ marginTop: 4 }}>
            <summary className="muted" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
              Optionele extra velden
            </summary>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefoon" />
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" />
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categorie (Bar / Café / Pub)" />
            </div>
          </details>

          {!canSave && (
            <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
              Vul een naam in plus óf een adres, óf lat+lng.
            </p>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="btn-sm btn-ghost" onClick={onClose}>Annuleer</button>
            <button type="button" className="btn-sm btn-primary" onClick={handleSave} disabled={!canSave}>
              {isEdit ? "Opslaan" : "Voeg toe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
