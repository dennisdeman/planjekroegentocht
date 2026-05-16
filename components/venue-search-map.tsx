"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { VENUE_TYPE_BADGES } from "@lib/venue-type-badge";

export interface MapVenue {
  /** Stabiele key (sourceId of `${name}|${address}` fallback). Identificeert venue over zoekopdrachten heen. */
  key: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  searchType?: string;
  isDuplicate: boolean;
  /** Optionele markering "uit eerdere zoekopdracht" — voor toelichting in popup. */
  fromPreviousSearch?: boolean;
  /** Al toegevoegd in de huidige config — getoond als grijs-genummerd, niet klikbaar voor toggle. */
  isExistingInConfig?: boolean;
}

interface Props {
  venues: MapVenue[];
  /** Selectie-volgorde (eerst geklikt = positie 0). Bepaalt de cijfers op markers. */
  selectionOrder: string[];
  hoveredKey: string | null;
  routeGeo: GeoJSON.FeatureCollection | null;
  onToggle: (key: string) => void;
  onHoverChange: (key: string | null) => void;
  height?: number;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === "\"" ? "&quot;" : "&#39;"
  );
}

function pinIcon(opts: {
  selected: boolean;
  existingInConfig: boolean;
  positionInRoute: number | null;
  type: string | undefined;
  hovered: boolean;
  duplicate: boolean;
}): L.DivIcon {
  const badge = opts.type ? VENUE_TYPE_BADGES[opts.type] : null;
  let bg = "#9ca3af";
  let fg = "#ffffff";
  if (opts.existingInConfig) {
    bg = "#6b7280"; // donker grijs — reeds in config, immutable
    fg = "#ffffff";
  } else if (opts.selected) {
    bg = "#16a34a"; // groen
    fg = "#ffffff";
  } else if (opts.duplicate) {
    bg = "#d1d5db";
    fg = "#6b7280";
  } else if (badge) {
    bg = badge.bg;
    fg = badge.fg;
  }
  const size = opts.hovered ? 34 : 28;
  const border = opts.hovered ? "3px solid #1d4ed8" : "2px solid #ffffff";
  const hasNumber = opts.positionInRoute !== null && (opts.selected || opts.existingInConfig);
  const content = hasNumber ? String(opts.positionInRoute! + 1) : (badge?.icon ?? "•");
  return L.divIcon({
    className: "venue-search-marker",
    html: `<div style="
      background:${bg};color:${fg};border:${border};border-radius:50%;
      width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
      font-weight:600;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.35);
      transition:width 0.1s,height 0.1s;
    ">${content}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function VenueSearchMap({
  venues,
  selectionOrder,
  hoveredKey,
  routeGeo,
  onToggle,
  onHoverChange,
  height = 450,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.GeoJSON | null>(null);
  /** Cache van venue-key-set zodat we alleen fit-bounds doen als de set echt verandert. */
  const lastVenueKeyRef = useRef<string>("");
  /** Laatst-gefitte venues (in latest render) — voor refit bij container-resize. */
  const venuesRef = useRef<MapVenue[]>(venues);
  venuesRef.current = venues;

  /** Forceer een fitBounds-pass met de huidige venues. */
  const refit = (force = false) => {
    const map = mapRef.current;
    if (!map) return;
    const vs = venuesRef.current;
    if (vs.length === 0) return;
    try {
      map.invalidateSize();
      if (vs.length === 1) {
        map.setView(L.latLng(vs[0].lat, vs[0].lng), 16);
      } else {
        const bounds = L.latLngBounds(vs.map((v) => L.latLng(v.lat, v.lng)));
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
      }
      if (force) {
        const key = vs.map((v) => v.key).sort().join("|");
        lastVenueKeyRef.current = key;
      }
    } catch { /* map destroyed */ }
  };

  // Init map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    map.setView([52.1, 5.3], 7);

    // ResizeObserver: refit zodra de container z'n echte afmetingen krijgt
    // (bij dynamic-import is de eerste render vaak nog 0×0).
    let resizeObs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mapDivRef.current) {
      let lastWidth = 0;
      let lastHeight = 0;
      resizeObs = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (Math.abs(width - lastWidth) < 1 && Math.abs(height - lastHeight) < 1) continue;
          lastWidth = width;
          lastHeight = height;
          // Eerste keer dat we een echte size krijgen, of na grote resize: refit.
          if (width > 0 && height > 0) refit(true);
        }
      });
      resizeObs.observe(mapDivRef.current);
    }

    // Forceer ook een refit na initialisatie (whenReady firet zodra Leaflet klaar is).
    map.whenReady(() => {
      setTimeout(() => refit(true), 0);
    });

    return () => {
      if (resizeObs) resizeObs.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render markers — re-create on venues/selection/hover change.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();

    const selectedSet = new Set(selectionOrder);

    venues.forEach((v) => {
      const positionInRoute = selectionOrder.indexOf(v.key);
      const isExisting = v.isExistingInConfig === true;
      const isSelected = selectedSet.has(v.key) && !isExisting;
      const icon = pinIcon({
        selected: isSelected,
        existingInConfig: isExisting,
        positionInRoute: positionInRoute >= 0 ? positionInRoute : null,
        type: v.searchType,
        hovered: hoveredKey === v.key,
        duplicate: v.isDuplicate,
      });
      const marker = L.marker([v.lat, v.lng], { icon })
        .addTo(layer)
        .bindPopup(
          `<strong>${escapeHtml(v.name)}</strong>${
            v.address ? `<br/><small>${escapeHtml(v.address)}</small>` : ""
          }${isExisting ? `<br/><em style="color:#6b7280;font-size:11px;">📌 al in je configuratie</em>` : ""}${
            v.isDuplicate && !isExisting ? `<br/><em style="color:#9ca3af;">al toegevoegd</em>` : ""
          }${v.fromPreviousSearch ? `<br/><em style="color:#16a34a;font-size:11px;">🔖 uit eerdere zoekopdracht</em>` : ""}`
        );
      marker.on("click", () => {
        if (v.isDuplicate || isExisting) return;
        onToggle(v.key);
      });
      marker.on("mouseover", () => onHoverChange(v.key));
      marker.on("mouseout", () => onHoverChange(null));
      markersRef.current.set(v.key, marker);
    });

    // Fit bounds alleen als de venue-set echt verandert (niet bij elke hover/selectie).
    const venueSetKey = venues.map((v) => v.key).sort().join("|");
    const shouldFit = venues.length > 0 && venueSetKey !== lastVenueKeyRef.current;
    if (shouldFit) {
      lastVenueKeyRef.current = venueSetKey;
      // RAF zorgt dat React eerst commit-doet, daarna leaflet rekent met juiste size.
      const raf = requestAnimationFrame(() => refit(false));
      return () => cancelAnimationFrame(raf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    venues.map((v) => v.key).join("|"),
    selectionOrder.join("|"),
    hoveredKey,
  ]);

  // Render route geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (!routeGeo) return;
    routeLayerRef.current = L.geoJSON(routeGeo, {
      style: { color: "#16a34a", weight: 4, opacity: 0.85 },
    }).addTo(map);
  }, [routeGeo]);

  return (
    <div
      ref={mapDivRef}
      style={{
        height,
        width: "100%",
        borderRadius: 6,
        border: "1px solid var(--line, #e2e6ec)",
        overflow: "hidden",
      }}
    />
  );
}
