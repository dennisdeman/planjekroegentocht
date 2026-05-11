"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { confirmDialog } from "@ui/ui/confirm-dialog";

interface Photo {
  id: string;
  stationId: string;
  timeslotIndex: number | null;
  uploadedByName: string | null;
  fileKey: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  approved: boolean;
  createdAt: string;
}

interface ScheduleConfig {
  stations: Array<{ id: string; locationId: string; activityTypeId: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  activityTypes: Array<{ id: string; name: string }>;
  timeslots: Array<{ id: string; index: number; kind: string }>;
}

interface PhotoGalleryProps {
  kroegentochtId: string;
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function PhotoGallery({ kroegentochtId }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [config, setConfig] = useState<ScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStation, setFilterStation] = useState("");
  const [filterTimeslot, setFilterTimeslot] = useState("");
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);

  const fetchPhotos = useCallback(() => {
    const params = new URLSearchParams();
    if (filterStation) params.set("station", filterStation);
    if (filterTimeslot) params.set("timeslot", filterTimeslot);
    fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/photos?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.photos) setPhotos(d.photos);
        if (typeof d.photoAutoApprove === "boolean") setAutoApprove(d.photoAutoApprove);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kroegentochtId, filterStation, filterTimeslot]);

  useEffect(() => {
    fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/matches`)
      .then((r) => r.json())
      .then((d) => { if (d.config) setConfig(d.config); })
      .catch(() => {});
  }, [kroegentochtId]);

  useEffect(() => {
    setLoading(true);
    fetchPhotos();
    const id = setInterval(fetchPhotos, 10000);
    return () => clearInterval(id);
  }, [fetchPhotos]);

  const stationById = useMemo(() => {
    const m = new Map<string, { name: string; locationName: string; activityName: string }>();
    if (!config) return m;
    for (const s of config.stations) {
      const loc = config.locations.find((l) => l.id === s.locationId);
      const act = config.activityTypes.find((a) => a.id === s.activityTypeId);
      m.set(s.id, { name: s.name, locationName: loc?.name ?? "", activityName: act?.name ?? "" });
    }
    return m;
  }, [config]);

  const activeTimeslots = useMemo(() => {
    if (!config) return [];
    return config.timeslots.filter((t) => t.kind === "active").sort((a, b) => a.index - b.index);
  }, [config]);

  function roundLabel(timeslotIndex: number | null): string {
    if (timeslotIndex == null) return "";
    const pos = activeTimeslots.findIndex((t) => t.index === timeslotIndex);
    return pos >= 0 ? `Ronde ${pos + 1}` : "";
  }

  function stationLabel(stationId: string): string {
    const s = stationById.get(stationId);
    return s ? `${s.activityName} @ ${s.locationName}` : stationId;
  }

  async function handleApprove(photoId: string, approved: boolean) {
    try {
      const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (res.ok) {
        setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, approved } : p));
      }
    } catch { /* ignore */ }
  }

  async function handleToggleAutoApprove() {
    const next = !autoApprove;
    try {
      const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoAutoApprove: next }),
      });
      if (res.ok) setAutoApprove(next);
    } catch { /* ignore */ }
  }

  async function handleDelete(photoId: string) {
    if (!(await confirmDialog({ title: "Foto verwijderen", message: "Weet je zeker dat je deze foto wilt verwijderen?", confirmLabel: "Verwijderen", variant: "danger" }))) return;
    setDeleting(photoId);
    try {
      const res = await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/photos/${photoId}`, { method: "DELETE" });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
        if (lightbox?.id === photoId) setLightbox(null);
      }
    } catch { /* ignore */ }
    setDeleting(null);
  }

  const pendingCount = photos.filter((p) => !p.approved).length;

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Media</h3>
          {pendingCount > 0 && (
            <span style={{ background: "var(--accent)", color: "#fff", fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
              {pendingCount} wachtend
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.82rem" }}>
          {config && config.stations.length > 1 && (
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} style={{ fontSize: "0.82rem", padding: "4px 8px" }}>
              <option value="">Alle stations</option>
              {config.stations.map((s) => {
                const info = stationById.get(s.id);
                return <option key={s.id} value={s.id}>{info ? `${info.activityName} @ ${info.locationName}` : s.name}</option>;
              })}
            </select>
          )}
          {activeTimeslots.length > 1 && (
            <select value={filterTimeslot} onChange={(e) => setFilterTimeslot(e.target.value)} style={{ fontSize: "0.82rem", padding: "4px 8px" }}>
              <option value="">Alle rondes</option>
              {activeTimeslots.map((t, i) => (
                <option key={t.id} value={String(t.index)}>Ronde {i + 1}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: "0.82rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={autoApprove} onChange={handleToggleAutoApprove} />
          Auto-goedkeuren
        </label>
        <span className="muted">
          {autoApprove ? "Nieuwe foto's worden direct zichtbaar" : "Nieuwe foto's wachten op goedkeuring"}
        </span>
      </div>

      {loading && (
        <p className="muted" style={{ textAlign: "center", padding: 20 }}>Laden...</p>
      )}

      {!loading && photos.length === 0 && (
        <p className="muted" style={{ textAlign: "center", padding: 20 }}>
          Nog geen foto&apos;s gedeeld door spelbegeleiders.
        </p>
      )}

      {!loading && photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((photo) => (
            <div key={photo.id} className={`photo-card${!photo.approved ? " photo-card-pending" : ""}`} onClick={() => setLightbox(photo)}>
              <img
                src={photo.url}
                alt={photo.fileName}
                loading="lazy"
              />
              {!photo.approved && (
                <div className="photo-pending-badge">Wachtend</div>
              )}
              <div className="photo-card-overlay">
                <div style={{ fontWeight: 600, fontSize: "0.72rem" }}>{stationLabel(photo.stationId)}</div>
                <div style={{ fontSize: "0.68rem", opacity: 0.85 }}>
                  {roundLabel(photo.timeslotIndex)}
                  {photo.uploadedByName ? ` · ${photo.uploadedByName}` : ""}
                  {" · "}{fmtDateTime(photo.createdAt)}
                </div>
              </div>
              <div className="photo-card-actions">
                {!photo.approved && (
                  <button type="button" className="photo-approve-btn" onClick={(e) => { e.stopPropagation(); handleApprove(photo.id, true); }} aria-label="Goedkeuren">✓</button>
                )}
                {photo.approved && (
                  <button type="button" className="photo-reject-btn" onClick={(e) => { e.stopPropagation(); handleApprove(photo.id, false); }} aria-label="Afkeuren">✕</button>
                )}
                <button
                  type="button"
                  className="photo-delete-btn"
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                  disabled={deleting === photo.id}
                  aria-label="Verwijderen"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && createPortal(
        <div
          className="photo-lightbox"
          onClick={() => setLightbox(null)}
        >
          <div className="photo-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.fileName} />
            <div style={{ padding: "10px 14px", fontSize: "0.85rem" }}>
              <div><strong>{stationLabel(lightbox.stationId)}</strong></div>
              <div className="muted" style={{ fontSize: "0.78rem" }}>
                {roundLabel(lightbox.timeslotIndex)}
                {lightbox.uploadedByName ? ` · ${lightbox.uploadedByName}` : ""}
                {" · "}{fmtDateTime(lightbox.createdAt)}
              </div>
            </div>
            <button
              type="button"
              className="photo-lightbox-close"
              onClick={() => setLightbox(null)}
            >
              &times;
            </button>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
