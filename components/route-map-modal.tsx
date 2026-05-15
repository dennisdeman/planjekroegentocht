"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { LocationV2 } from "@core";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getVenueTypeBadge } from "@lib/venue-type-badge";

interface Props {
  locations: LocationV2[];
  /** Map van locatie-id naar de namen van spellen die er gespeeld worden. */
  spellenByLocationId?: Record<string, string[]>;
  onClose: () => void;
  onApply: (reordered: LocationV2[]) => void;
}

function numberedIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: "route-marker",
    html: `<div style="
      background:#1d4ed8;color:#fff;border:2px solid #fff;border-radius:50%;
      width:28px;height:28px;display:flex;align-items:center;justify-content:center;
      font-weight:600;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function RouteMapModal({ locations, spellenByLocationId, onClose, onApply }: Props) {
  const [order, setOrder] = useState<LocationV2[]>(locations);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [routeGeo, setRouteGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.GeoJSON | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  const withCoords = order.filter((l) => l.lat != null && l.lng != null);
  const withoutCoords = order.filter((l) => l.lat == null || l.lng == null);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    // Fit op Nederland als fallback; bounds-fit komt zo via update-effect.
    map.setView([52.1, 5.3], 7);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraw markers + straight fallback line whenever order changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const coords = withCoords
      .map((l, i) => ({
        latlng: L.latLng(l.lat!, l.lng!),
        idx: i + 1,
        loc: l,
      }));

    if (coords.length === 0) return;

    coords.forEach((c) => {
      const spellen = spellenByLocationId?.[c.loc.id] ?? [];
      const spellenHtml =
        spellen.length > 0
          ? `<div style="margin-top:6px;font-size:12px;"><strong>🎮 Spel${spellen.length > 1 ? "len" : ""}:</strong><ul style="margin:2px 0 0 16px;padding:0;">${spellen
              .map((s) => `<li>${escapeHtml(s)}</li>`)
              .join("")}</ul></div>`
          : `<div style="margin-top:6px;font-size:12px;color:#888;"><em>Nog geen spel gekoppeld</em></div>`;
      const badge = getVenueTypeBadge(c.loc.venueType);
      const badgeHtml = badge
        ? `<span style="display:inline-block;font-size:11px;padding:1px 5px;border-radius:4px;background:${badge.bg};color:${badge.fg};margin-right:6px;">${badge.icon} ${escapeHtml(badge.label)}</span>`
        : "";
      L.marker(c.latlng, { icon: numberedIcon(c.idx) })
        .addTo(layer)
        .bindPopup(
          `<strong>${c.idx}. ${escapeHtml(c.loc.name)}</strong><br/>${badgeHtml}${
            c.loc.address ? `<small>${escapeHtml(c.loc.address)}</small>` : ""
          }${spellenHtml}`
        );
    });

    // Dashed straight-line fallback. Wordt overschreven door echte route zodra die binnen is.
    if (coords.length >= 2 && !routeGeo) {
      L.polyline(coords.map((c) => c.latlng), {
        color: "#1d4ed8",
        weight: 3,
        opacity: 0.5,
        dashArray: "6,6",
      }).addTo(layer);
    }

    const bounds = L.latLngBounds(coords.map((c) => c.latlng));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    const timer = setTimeout(() => {
      // Map kan al opgeruimd zijn als modal sluit / re-render plaatsvindt.
      if (mapRef.current && mapDivRef.current) {
        try { mapRef.current.invalidateSize(); } catch { /* map destroyed */ }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [order, routeGeo]);

  // Debounced fetch van ORS Directions bij elke order-change.
  useEffect(() => {
    const coords: [number, number][] = withCoords.map((l) => [l.lng!, l.lat!]);
    if (coords.length < 2) {
      setRouteGeo(null);
      setRouteError(null);
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
          body: JSON.stringify({ coords }),
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
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    // Re-fetch alleen als de set+volgorde van coords echt verandert.
    withCoords.map((l) => `${l.lat},${l.lng}`).join("|"),
  ]);

  // Render de ORS-route als aparte layer (zodat ie niet wegvalt bij order-only redraws).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (!routeGeo) return;
    routeLayerRef.current = L.geoJSON(routeGeo, {
      style: {
        color: "#1d4ed8",
        weight: 4,
        opacity: 0.85,
      },
    }).addTo(map);
  }, [routeGeo]);

  function moveWithCoordEntry(fromOrderIdx: number, toOrderIdx: number) {
    if (fromOrderIdx === toOrderIdx) return;
    const next = [...order];
    const [moved] = next.splice(fromOrderIdx, 1);
    next.splice(toOrderIdx, 0, moved);
    setOrder(next);
  }

  // Per-segment afstand + duur uit ORS-response (indien beschikbaar).
  // segments.length === withCoords.length - 1
  const segments: { distance: number; duration: number }[] | null = (() => {
    if (!routeGeo) return null;
    const feature = routeGeo.features?.[0];
    if (!feature) return null;
    const props = feature.properties as { segments?: { distance?: number; duration?: number }[] } | undefined;
    if (!props?.segments) return null;
    return props.segments
      .filter((s): s is { distance: number; duration: number } =>
        typeof s.distance === "number" && typeof s.duration === "number"
      );
  })();

  const summary: { distance: number; duration: number } | null = (() => {
    if (!routeGeo) return null;
    const feature = routeGeo.features?.[0];
    const props = feature?.properties as
      | { summary?: { distance?: number; duration?: number } }
      | undefined;
    const s = props?.summary;
    if (!s || typeof s.distance !== "number" || typeof s.duration !== "number") return null;
    return { distance: s.distance, duration: s.duration };
  })();

  function formatDuration(seconds: number): string {
    const min = Math.max(1, Math.round(seconds / 60));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} u` : `${h} u ${m} min`;
  }

  function formatDistance(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  }

  function formatLeg(distMeters: number, durSeconds: number): string {
    const min = Math.max(1, Math.round(durSeconds / 60));
    const distStr =
      distMeters >= 1000
        ? `${(distMeters / 1000).toFixed(1)} km`
        : `${Math.round(distMeters)} m`;
    return `🚶 ~${min} min · ${distStr}`;
  }

  // Helper: idx van het n-de "withCoords" item terug naar zijn index in `order`.
  function orderIdxOfWithCoord(n: number): number {
    let count = -1;
    for (let i = 0; i < order.length; i++) {
      const l = order[i];
      if (l.lat != null && l.lng != null) {
        count += 1;
        if (count === n) return i;
      }
    }
    return -1;
  }

  return (
    <div
      className="help-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="help-modal-card"
        style={{
          width: "min(1280px, 100%)",
          height: "min(720px, 90vh)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border, #ddd)",
          }}
        >
          <h3 style={{ margin: 0 }}>Routekaart</h3>
          <button type="button" className="btn-sm btn-ghost" onClick={onClose}>
            Sluit
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div
            ref={mapDivRef}
            style={{ flex: 1, minWidth: 0, background: "#f0f0f0" }}
          />
          <aside
            style={{
              width: 360,
              borderLeft: "1px solid var(--border, #ddd)",
              overflowY: "auto",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Sleep om de volgorde te wijzigen. De route op de kaart volgt.
            </div>
            <div style={{ fontSize: "0.72rem", color: routeError ? "#b91c1c" : "var(--muted, #777)" }}>
              {routeLoading
                ? "🛣️ Route ophalen…"
                : routeError
                  ? `⚠️ Echte route niet beschikbaar (${routeError.slice(0, 60)})`
                  : routeGeo
                    ? "🛣️ Straat-route getoond"
                    : "🛣️ Rechte lijn (≥2 locaties met coördinaten nodig voor echte route)"}
            </div>
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {withCoords.map((loc, nthCoord) => {
                const orderIdx = orderIdxOfWithCoord(nthCoord);
                const dragging = dragIdx === orderIdx;
                const leg = segments && nthCoord < withCoords.length - 1 ? segments[nthCoord] : null;
                return (
                  <Fragment key={loc.id}>
                  <li
                    draggable
                    onDragStart={() => setDragIdx(orderIdx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIdx == null) return;
                      moveWithCoordEntry(dragIdx, orderIdx);
                      setDragIdx(null);
                    }}
                    onDragEnd={() => setDragIdx(null)}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 10px",
                      background: dragging ? "#dbeafe" : "var(--surface, #fff)",
                      border: "1px solid var(--border, #ddd)",
                      borderRadius: 6,
                      cursor: "grab",
                      opacity: dragging ? 0.5 : 1,
                    }}
                  >
                    <div
                      style={{
                        flex: "0 0 26px",
                        height: 26,
                        background: "#1d4ed8",
                        color: "#fff",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {nthCoord + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        {(() => {
                          const badge = getVenueTypeBadge(loc.venueType);
                          if (!badge) return null;
                          return (
                            <span
                              style={{
                                fontSize: "0.65rem",
                                padding: "0 4px",
                                borderRadius: 3,
                                background: badge.bg,
                                color: badge.fg,
                                flexShrink: 0,
                              }}
                              title={badge.label}
                            >
                              {badge.icon}
                            </span>
                          );
                        })()}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {loc.name}
                        </span>
                      </div>
                      {loc.address ? (
                        <div className="muted" style={{ fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {loc.address}
                        </div>
                      ) : null}
                    </div>
                    <span aria-hidden style={{ color: "var(--muted, #999)", cursor: "grab", flexShrink: 0 }}>
                      ⋮⋮
                    </span>
                  </li>
                  {leg ? (
                    <div
                      className="muted"
                      style={{
                        fontSize: "0.72rem",
                        marginLeft: 16,
                        paddingLeft: 8,
                        borderLeft: "2px solid var(--border, #ddd)",
                        lineHeight: 1.4,
                      }}
                    >
                      {formatLeg(leg.distance, leg.duration)}
                    </div>
                  ) : null}
                  </Fragment>
                );
              })}
            </ol>

            {withoutCoords.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                  Niet op kaart (geen coördinaten):
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
                  {withoutCoords.map((loc) => (
                    <li
                      key={loc.id}
                      style={{
                        padding: "6px 8px",
                        background: "var(--surface-muted, #f7f7f7)",
                        borderRadius: 4,
                        fontSize: "0.8rem",
                      }}
                    >
                      {loc.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid var(--border, #ddd)",
          }}
        >
          <div style={{ fontSize: "0.85rem" }}>
            {summary ? (
              <span>
                <strong>Totale route:</strong> 🚶 {formatDuration(summary.duration)} ·{" "}
                {formatDistance(summary.distance)}
              </span>
            ) : (
              <span className="muted">Totale route nog niet beschikbaar</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-sm btn-ghost" onClick={onClose}>
              Annuleren
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => {
                onApply(order);
                onClose();
              }}
            >
              Toepassen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
