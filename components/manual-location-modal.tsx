"use client";

import { useRef, useState } from "react";
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
  const searchIdRef = useRef(0);

  const latNum = lat.trim() ? Number(lat) : null;
  const lngNum = lng.trim() ? Number(lng) : null;
  const hasCoords =
    latNum !== null && lngNum !== null && Number.isFinite(latNum) && Number.isFinite(lngNum);
  const hasAddress = address.trim().length > 0;
  const canSave = name.trim().length > 0 && (hasAddress || hasCoords);

  async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=10`,
        { headers: { "Accept-Language": "nl" } }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { address?: { city?: string; town?: string; village?: string; municipality?: string; state?: string } };
      const a = data.address;
      if (!a) return null;
      return a.city ?? a.town ?? a.village ?? a.municipality ?? a.state ?? null;
    } catch {
      return null;
    }
  }

  async function enrichWithCities(results: VenueResult[], myId: number) {
    for (let i = 0; i < results.length; i++) {
      if (searchIdRef.current !== myId) return; // newer search took over
      const r = results[i];
      if (r.address || r.lat == null || r.lng == null) continue;
      const city = await reverseGeocodeCity(r.lat, r.lng);
      if (searchIdRef.current !== myId) return;
      if (city) {
        setSearchResults((prev) => {
          if (!prev[i] || prev[i].sourceId !== r.sourceId) return prev;
          const next = [...prev];
          next[i] = { ...next[i], address: city };
          return next;
        });
      }
      // Polite gap voor Nominatim's 1 req/s limit.
      await new Promise((res) => setTimeout(res, 1100));
    }
  }

  async function runSearch() {
    const nameQ = name.trim();
    if (!nameQ) return;
    // Combineer naam + adres in de query zodat Google de juiste regio pakt
    // ("cafe aan de haven" alleen → Lock Haven, PA. "cafe aan de haven Culemborg" → NL).
    const addressQ = address.trim();
    const q = addressQ ? `${nameQ} ${addressQ}` : nameQ;
    const myId = ++searchIdRef.current;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/venues/search?q=${encodeURIComponent(q)}&type=bar`);
      const data = (await res.json()) as { results?: VenueResult[]; error?: string };
      if (!res.ok) {
        setSearchError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const results = data.results ?? [];
      setSearchResults(results);
      setSearched(true);
      // Asynchroon de plaatsnamen erbij ophalen voor resultaten zonder adres.
      void enrichWithCities(results, myId);
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
      const data = (await res.json()) as {
        display_name?: string;
        address?: {
          road?: string;
          house_number?: string;
          postcode?: string;
          town?: string;
          city?: string;
          village?: string;
          municipality?: string;
        };
      };
      const a = data.address;
      if (a) {
        // NL-stijl: "Straat 12, 1234 AB Stad"
        const streetPart = [a.road, a.house_number].filter(Boolean).join(" ");
        const cityName = a.town ?? a.city ?? a.village ?? a.municipality;
        const cityPart = [a.postcode, cityName].filter(Boolean).join(" ");
        const formatted = [streetPart, cityPart].filter(Boolean).join(", ");
        if (formatted) return formatted;
      }
      // Fallback: ruwe display_name als de gestructureerde velden ontbreken.
      return data.display_name ?? null;
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

    // Reverse-geocode op klik wanneer we coords hebben — Nominatim levert
    // consistent "Straat 12, 1234 AB Stad" terug. Serper's adres-veld
    // bevat soms alleen de straat (bv. "Havendijk 22"). Verkies Nominatim
    // wanneer 't meer onderdelen heeft.
    if (r.lat != null && r.lng != null) {
      setReverseGeocoding(true);
      const fullAddress = await reverseGeocode(r.lat, r.lng);
      setReverseGeocoding(false);
      if (fullAddress) {
        const serperPartCount = r.address ? r.address.split(",").length : 0;
        const nominatimPartCount = fullAddress.split(",").length;
        if (nominatimPartCount > serperPartCount) {
          setAddress(fullAddress);
        }
      }
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
                    {r.address ?? (r.lat != null ? "plaats ophalen…" : "geen adres")}
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
