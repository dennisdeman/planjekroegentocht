"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface Photo {
  id: string;
  stationId: string;
  timeslotIndex: number | null;
  uploadedByName: string | null;
  url: string;
  fileName: string;
  createdAt: string;
}

interface Config {
  stations: Array<{ id: string; locationId: string; activityTypeId: string; name?: string }>;
  locations: Array<{ id: string; name: string }>;
  activityTypes: Array<{ id: string; name: string }>;
  timeslots: Array<{ id: string; index: number; kind: string }>;
}

type TransitionType = "fade" | "slide" | "kenburns";

const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Schuiven" },
  { value: "kenburns", label: "Ken Burns" },
];

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function fmtDateFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function PublicMediaPage() {
  const params = useParams<{ kroegentochtId: string; token: string }>();
  const token = params?.token ?? "";

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStation, setFilterStation] = useState("");
  const [filterTimeslot, setFilterTimeslot] = useState("");
  const [lightbox, setLightbox] = useState<number | null>(null);

  // Slideshow state
  const [slideshow, setSlideshow] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [transition, setTransition] = useState<TransitionType>("fade");
  const [intervalSec, setIntervalSec] = useState(5);
  const [showCaption, setShowCaption] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [slideKey, setSlideKey] = useState(0); // triggers re-animation
  const slideshowRef = useRef<HTMLDivElement>(null);

  const fetchPhotos = useCallback(() => {
    const p = new URLSearchParams();
    if (filterStation) p.set("station", filterStation);
    if (filterTimeslot) p.set("timeslot", filterTimeslot);
    fetch(`/api/live/program/${encodeURIComponent(token)}/photos?${p}`)
      .then((r) => { if (!r.ok) throw new Error("Geen toegang."); return r.json(); })
      .then((d) => {
        if (d.photos) setPhotos(d.photos);
        if (d.config && !config) setConfig(d.config);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token, filterStation, filterTimeslot, config]);

  useEffect(() => {
    fetchPhotos();
    const id = setInterval(fetchPhotos, 15000);
    return () => clearInterval(id);
  }, [fetchPhotos]);

  const stationById = useMemo(() => {
    const m = new Map<string, string>();
    if (!config) return m;
    for (const s of config.stations) {
      const loc = config.locations.find((l) => l.id === s.locationId);
      const act = config.activityTypes.find((a) => a.id === s.activityTypeId);
      m.set(s.id, `${act?.name ?? "Spel"} @ ${loc?.name ?? "Kroeg"}`);
    }
    return m;
  }, [config]);

  const activeTimeslots = useMemo(() => {
    if (!config) return [];
    return config.timeslots.filter((t) => t.kind === "active").sort((a, b) => a.index - b.index);
  }, [config]);

  function roundLabel(idx: number | null): string {
    if (idx == null) return "";
    const pos = activeTimeslots.findIndex((t) => t.index === idx);
    return pos >= 0 ? `Ronde ${pos + 1}` : "";
  }

  // Slideshow auto-advance
  useEffect(() => {
    if (!slideshow || lightbox == null || photos.length === 0) return;
    const id = setInterval(() => {
      setLightbox((cur) => {
        let next: number;
        if (shuffle && photos.length > 1) {
          do { next = Math.floor(Math.random() * photos.length); } while (next === cur);
        } else {
          next = cur != null ? (cur + 1) % photos.length : 0;
        }
        setSlideKey((k) => k + 1);
        return next;
      });
    }, intervalSec * 1000);
    return () => clearInterval(id);
  }, [slideshow, photos.length, intervalSec, shuffle]); // intentionally exclude lightbox to avoid reset on every slide

  // Exit fullscreen → stop slideshow
  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement && slideshow) {
        setSlideshow(false);
        setShowControls(true);
        setLightbox(null);
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [slideshow]);

  function startSlideshow() {
    setSlideshow(true);
    setShowControls(false);
    setLightbox(0);
    setSlideKey(0);
    // Fullscreen
    const el = slideshowRef.current ?? document.documentElement;
    el.requestFullscreen?.().catch(() => {});
  }

  function stopSlideshow() {
    setSlideshow(false);
    setShowControls(true);
    setLightbox(null);
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function handleLightboxClick(idx: number) {
    setSlideshow(false);
    setShowControls(true);
    setLightbox(idx);
  }

  if (loading) return <Center>Laden...</Center>;
  if (error) return <Center><div className="notice notice-error"><p style={{ margin: 0 }}>{error}</p></div></Center>;

  const currentPhoto = lightbox != null ? photos[lightbox] : null;

  // CSS class for current transition
  const transClass = slideshow ? `ss-${transition}` : "";

  return (
    <div ref={slideshowRef} style={{ minHeight: "100vh", background: slideshow ? "#000" : undefined }}>
      {/* Header met filters */}
      {!slideshow && (
        <div style={{
          position: "sticky", top: 0, zIndex: 40, background: "#eef1f5", padding: "12px 16px",
          borderBottom: "1px solid var(--line)", boxShadow: "0 2px 8px rgba(16,33,52,0.06)",
        }}>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", flex: 1 }}>Foto&apos;s</h2>
              {photos.length > 0 && (
                <button type="button" className="btn-primary btn-sm" onClick={startSlideshow}>
                  Slideshow
                </button>
              )}
            </div>
            <div className="media-filters">
              <span className="media-filter-label">Filter</span>
              {config && config.stations.length > 1 && (
                <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)}>
                  <option value="">Alle stations</option>
                  {config.stations.map((s) => (
                    <option key={s.id} value={s.id}>{stationById.get(s.id) ?? s.name ?? s.id}</option>
                  ))}
                </select>
              )}
              {activeTimeslots.length > 1 && (
                <select value={filterTimeslot} onChange={(e) => setFilterTimeslot(e.target.value)}>
                  <option value="">Alle rondes</option>
                  {activeTimeslots.map((t, i) => (
                    <option key={t.id} value={String(t.index)}>Ronde {i + 1}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="media-filters">
              <span className="media-filter-label">Slideshow</span>
              <select value={transition} onChange={(e) => setTransition(e.target.value as TransitionType)}>
                {TRANSITIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))}>
                {[3, 4, 5, 7, 10, 15].map((s) => <option key={s} value={s}>{s}s</option>)}
              </select>
              <select value={showCaption ? "show" : "hide"} onChange={(e) => setShowCaption(e.target.value === "show")}>
                <option value="show">Toon titel</option>
                <option value="hide">Verberg titel</option>
              </select>
              <select value={shuffle ? "shuffle" : "order"} onChange={(e) => setShuffle(e.target.value === "shuffle")}>
                <option value="order">Op volgorde</option>
                <option value="shuffle">Willekeurig</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Foto grid */}
      {!slideshow && photos.length === 0 && (
        <div style={{ maxWidth: 960, margin: "40px auto", textAlign: "center" }}>
          <p className="muted">Nog geen foto&apos;s gedeeld.</p>
        </div>
      )}
      {!slideshow && photos.length > 0 && (
        <div style={{ padding: 16 }}>
          <div className="photo-grid" style={{ maxWidth: 960, margin: "0 auto" }}>
            {photos.map((photo, idx) => (
              <div key={photo.id} className="photo-card" onClick={() => handleLightboxClick(idx)}>
                <img src={photo.url} alt={photo.fileName} loading="lazy" />
                <div className="photo-card-overlay">
                  <div style={{ fontWeight: 600, fontSize: "0.72rem" }}>{stationById.get(photo.stationId) ?? ""}</div>
                  <div style={{ fontSize: "0.68rem", opacity: 0.85 }}>
                    {roundLabel(photo.timeslotIndex)}
                    {photo.uploadedByName ? ` · ${photo.uploadedByName}` : ""}
                    {" · "}{fmtTime(photo.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slideshow fullscreen */}
      {slideshow && currentPhoto && (
        <div
          className="ss-container"
          onClick={() => setShowControls((v) => !v)}
        >
          {/* Blurred background for portrait photos */}
          <div className="ss-bg" style={{ backgroundImage: `url(${currentPhoto.url})` }} />

          {/* Main photo with transition */}
          <div key={slideKey} className={`ss-photo ${transClass}`}>
            <img src={currentPhoto.url} alt={currentPhoto.fileName} />
          </div>

          {/* Caption */}
          <div className={`ss-caption${!showCaption ? " ss-caption-hidden" : ""}`}>
            <strong>{stationById.get(currentPhoto.stationId) ?? ""}</strong>
            <span style={{ opacity: 0.8 }}>
              {roundLabel(currentPhoto.timeslotIndex)}
              {roundLabel(currentPhoto.timeslotIndex) ? " · " : ""}{fmtDateFull(currentPhoto.createdAt)}
            </span>
          </div>

          {/* Controls toggle */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowControls((v) => !v); }}
            className="ss-toggle-btn"
            style={{ transform: showControls ? "rotate(180deg)" : "none" }}
          >
            ▾
          </button>

          {/* Top bar */}
          {showControls && (
            <div className="ss-topbar" onClick={(e) => e.stopPropagation()}>
              <span style={{ flex: 1, fontWeight: 600 }}>
                {(lightbox ?? 0) + 1} / {photos.length}
              </span>
              <select value={transition} onChange={(e) => setTransition(e.target.value as TransitionType)} className="ss-select">
                {TRANSITIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} className="ss-select">
                {[3, 4, 5, 7, 10, 15].map((s) => <option key={s} value={s}>{s}s</option>)}
              </select>
              <select value={showCaption ? "show" : "hide"} onChange={(e) => setShowCaption(e.target.value === "show")} className="ss-select">
                <option value="show">Toon titel</option>
                <option value="hide">Verberg titel</option>
              </select>
              <select value={shuffle ? "shuffle" : "order"} onChange={(e) => setShuffle(e.target.value === "shuffle")} className="ss-select">
                <option value="order">Op volgorde</option>
                <option value="shuffle">Willekeurig</option>
              </select>
              <button type="button" className="ss-stop-btn" onClick={stopSlideshow}>
                Stoppen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Regular lightbox (non-slideshow) */}
      {!slideshow && currentPhoto && (
        <div className="photo-lightbox" onClick={() => setLightbox(null)}>
          <div className="photo-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={currentPhoto.url} alt={currentPhoto.fileName} />
            <div style={{ padding: "10px 14px", fontSize: "0.85rem" }}>
              <div><strong>{stationById.get(currentPhoto.stationId) ?? ""}</strong></div>
              <div className="muted" style={{ fontSize: "0.78rem" }}>
                {roundLabel(currentPhoto.timeslotIndex)}
                {currentPhoto.uploadedByName ? ` · ${currentPhoto.uploadedByName}` : ""}
                {" · "}{fmtTime(currentPhoto.createdAt)}
              </div>
            </div>
            {photos.length > 1 && (
              <>
                <button type="button" className="photo-nav-btn" style={{ left: 8 }} onClick={() => setLightbox(((lightbox ?? 0) - 1 + photos.length) % photos.length)}>‹</button>
                <button type="button" className="photo-nav-btn" style={{ right: 8 }} onClick={() => setLightbox(((lightbox ?? 0) + 1) % photos.length)}>›</button>
              </>
            )}
            <button type="button" className="photo-lightbox-close" onClick={() => setLightbox(null)}>&times;</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}><div style={{ textAlign: "center" }}>{children}</div></div>;
}
