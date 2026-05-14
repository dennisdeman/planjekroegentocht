"use client";

import { useEffect, useMemo, useState } from "react";
import type { MaterialItem, SpelExplanation } from "@core";

interface OrgSpel {
  id: string;
  baseKey: string | null;
  name: string;
  materials: MaterialItem[];
  explanation: SpelExplanation;
  isActive: boolean;
}

interface Props {
  onClose: () => void;
  onSelect?: (spel: { name: string; baseKey: string | null }) => void;
  /** Namen die al in de config zitten — worden gefilterd uit de lijst. */
  excludeNames?: string[];
  /** Info-only modus: toon één spel (op naam), auto-uitgeklapt, zonder kies-knop. */
  viewOnlyName?: string;
}

export function SpelPickerModal({ onClose, onSelect, excludeNames = [], viewOnlyName }: Props) {
  const [spellen, setSpellen] = useState<OrgSpel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isInfoMode = Boolean(viewOnlyName);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/org/spellen");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { spellen?: OrgSpel[] };
        if (cancelled) return;
        setSpellen(data.spellen ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Spellen-bibliotheek kon niet geladen worden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const excludeSet = useMemo(
    () => new Set(excludeNames.map((n) => n.toLowerCase())),
    [excludeNames]
  );

  const filtered = useMemo(() => {
    if (viewOnlyName) {
      return spellen.filter((s) => s.name.toLowerCase() === viewOnlyName.toLowerCase());
    }
    const q = search.trim().toLowerCase();
    return spellen
      .filter((s) => s.isActive)
      .filter((s) => !excludeSet.has(s.name.toLowerCase()))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.explanation.summary ?? "").toLowerCase().includes(q));
  }, [spellen, search, excludeSet, viewOnlyName]);

  // Auto-expand in info-mode
  useEffect(() => {
    if (isInfoMode && filtered.length > 0 && expandedId !== filtered[0].id) {
      setExpandedId(filtered[0].id);
    }
  }, [isInfoMode, filtered, expandedId]);

  function handlePick(s: OrgSpel) {
    if (!onSelect) return;
    onSelect({ name: s.name, baseKey: s.baseKey });
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
          <h3 style={{ margin: 0 }}>{isInfoMode ? `Spel: ${viewOnlyName}` : "Spel kiezen"}</h3>
          <button type="button" className="btn-sm btn-ghost" onClick={onClose}>Sluit</button>
        </div>

        {!isInfoMode && (
          <input
            type="text"
            placeholder="Zoek op naam of beschrijving…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
            autoFocus
          />
        )}

        {loading && <p className="muted">Spellen laden…</p>}
        {error && (
          <div className="notice notice-warning">
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="muted">
            {spellen.length === 0
              ? "Geen spellen in je bibliotheek. Voeg ze toe via Instellingen → Spellen."
              : excludeNames.length > 0 && search.trim() === ""
                ? "Alle beschikbare spellen zijn al toegevoegd aan deze kroegentocht."
                : "Geen spellen gevonden voor deze zoekopdracht."}
          </p>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((s) => {
            const isExpanded = expandedId === s.id;
            return (
              <div
                key={s.id}
                style={{
                  border: "1px solid var(--line, #e2e6ec)",
                  borderRadius: 8,
                  padding: 12,
                  background: isExpanded ? "rgba(74,144,226,0.04)" : "white",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: "0 0 4px" }}>{s.name}</h4>
                    <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                      {s.explanation.summary || <em>(geen beschrijving)</em>}
                    </p>
                    <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {s.explanation.duration && <span>⏱ {s.explanation.duration}</span>}
                      {s.explanation.playersPerTeam && <span>👥 {s.explanation.playersPerTeam}</span>}
                      {s.materials.length > 0 && <span>📦 {s.materials.length} item{s.materials.length !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!isInfoMode && (
                      <button
                        type="button"
                        className="btn-sm btn-ghost"
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      >
                        {isExpanded ? "Minder ▲" : "Meer ▼"}
                      </button>
                    )}
                    {!isInfoMode && onSelect && (
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        onClick={() => handlePick(s)}
                      >
                        + Kies
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, display: "grid", gap: 10, fontSize: "0.85rem" }}>
                    {s.explanation.rules && (
                      <div>
                        <strong>Regels</strong>
                        <p className="muted" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{s.explanation.rules}</p>
                      </div>
                    )}
                    {s.explanation.fieldSetup && (
                      <div>
                        <strong>Klaarzetten</strong>
                        <p className="muted" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{s.explanation.fieldSetup}</p>
                      </div>
                    )}
                    {s.materials.length > 0 && (
                      <div>
                        <strong>Materialen</strong>
                        <ul className="muted" style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                          {s.materials.map((m, i) => (
                            <li key={i}>
                              {m.quantity} {m.unit} {m.name}
                              {m.optional && <span> (optioneel)</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {s.explanation.variants && (
                      <div>
                        <strong>Varianten</strong>
                        <p className="muted" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{s.explanation.variants}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
