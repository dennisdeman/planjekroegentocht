"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConfigV2 } from "@core";
import { computeStationMaterials, computeMaterialTotals, findSpelByKey, type MaterialItem, type StationMaterials, type MaterialTotals, type OrgSpelMaterials } from "@core";
import { CollapsibleSection } from "./collapsible-section";

interface MaterialsSectionProps {
  config: ConfigV2;
  onUpdateOverrides: (overrides: Record<string, MaterialItem[]>) => void;
}

export function MaterialsSection({ config, onUpdateOverrides }: MaterialsSectionProps) {
  const [view, setView] = useState<"totaal" | "station" | "bewerken">("totaal");
  const [orgMaterials, setOrgMaterials] = useState<OrgSpelMaterials>({});

  useEffect(() => {
    fetch("/api/org/spellen")
      .then((r) => r.json())
      .then((d) => {
        const map: OrgSpelMaterials = {};
        for (const s of d.spellen ?? []) {
          if (s.baseKey && s.materials?.length > 0) map[s.baseKey] = s.materials;
        }
        setOrgMaterials(map);
      })
      .catch(() => {});
  }, []);

  const stationMaterials = useMemo(() => computeStationMaterials(config, config.materialOverrides, orgMaterials), [config, orgMaterials]);
  const totals = useMemo(() => computeMaterialTotals(stationMaterials), [stationMaterials]);
  const hasAny = stationMaterials.some((s) => s.items.length > 0);

  return (
    <section className="card" id="section-materialen">
      <CollapsibleSection title="Materialen" count={totals.length} defaultOpen={false}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="planner-view-toggle">
            <button type="button" className={view === "totaal" ? "is-active" : ""} onClick={() => setView("totaal")}>Totaal</button>
            <button type="button" className={view === "station" ? "is-active" : ""} onClick={() => setView("station")}>Per station</button>
            <button type="button" className={view === "bewerken" ? "is-active" : ""} onClick={() => setView("bewerken")}>Bewerken</button>
          </div>
          <span className="muted" style={{ fontSize: "0.82rem", flex: 1 }}>
            {view === "totaal" ? "Alles wat mee moet uit het magazijn" : view === "station" ? "Wat bij elk station klaargelegd moet worden" : "Materialen per spel aanpassen"}
          </span>
          {hasAny && view !== "bewerken" && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => void exportMaterialsPdf(config.name, stationMaterials, totals)}>
              Download PDF
            </button>
          )}
        </div>

        {!hasAny && view !== "bewerken" && (
          <p className="muted" style={{ fontSize: "0.88rem" }}>
            Geen materialen gevonden. Ga naar Bewerken om materialen toe te voegen, of gebruik spellen met een bekende naam.
          </p>
        )}

        {view === "totaal" && hasAny && <TotalsView totals={totals} />}
        {view === "station" && hasAny && <StationView stationMaterials={stationMaterials} />}
        {view === "bewerken" && (
          <EditView config={config} onUpdateOverrides={onUpdateOverrides} orgMaterials={orgMaterials} />
        )}
      </CollapsibleSection>
    </section>
  );
}

function TotalsView({ totals }: { totals: MaterialTotals[] }) {
  return (
    <div style={{ display: "grid", gap: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 8, padding: "6px 10px", fontWeight: 600, fontSize: "0.82rem", borderBottom: "2px solid var(--line)" }}>
        <span>Materiaal</span>
        <span style={{ textAlign: "right" }}>Aantal</span>
        <span style={{ textAlign: "right" }}>Eenheid</span>
      </div>
      {totals.map((item, i) => (
        <div key={`${item.name}-${item.unit}-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 8, padding: "6px 10px", fontSize: "0.88rem", borderBottom: "1px solid var(--line)", opacity: item.optional ? 0.6 : 1 }}>
          <span>{item.name}{item.optional && <span className="muted" style={{ fontSize: "0.75rem", marginLeft: 6 }}>optioneel</span>}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{item.quantity}</span>
          <span style={{ textAlign: "right" }}>{item.unit}</span>
        </div>
      ))}
    </div>
  );
}

function StationView({ stationMaterials }: { stationMaterials: StationMaterials[] }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {stationMaterials.map((station) => {
        const spel = station.baseId ? findSpelByKey(station.baseId) : null;
        return (
          <div key={station.stationId}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <strong style={{ fontSize: "0.9rem" }}>{station.stationName}</strong>
              {station.isRenamed && spel && (
                <span style={{ fontSize: "0.75rem", background: "rgba(212, 64, 23, 0.1)", color: "var(--accent)", padding: "1px 6px", borderRadius: 4 }}>
                  hernoemd van {spel.name}
                </span>
              )}
            </div>
            {station.items.length === 0 ? (
              <p className="muted" style={{ margin: "0 0 0 2px", fontSize: "0.82rem" }}>Geen materiaallijst.</p>
            ) : (
              <div style={{ display: "grid", gap: 0, marginLeft: 2 }}>
                {station.items.map((item, i) => (
                  <div key={`${item.name}-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", gap: 8, padding: "5px 8px", fontSize: "0.85rem", borderBottom: "1px solid var(--line)", opacity: item.optional ? 0.6 : 1 }}>
                    <span>{item.name}{item.optional && <span className="muted" style={{ fontSize: "0.72rem", marginLeft: 4 }}>optioneel</span>}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{item.quantity}</span>
                    <span style={{ textAlign: "right" }}>{item.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EditView({ config, onUpdateOverrides, orgMaterials }: { config: ConfigV2; onUpdateOverrides: (overrides: Record<string, MaterialItem[]>) => void; orgMaterials: OrgSpelMaterials }) {
  const overrides = config.materialOverrides ?? {};
  const activities = config.activityTypes.filter((a) => a.id !== "activity-pause");

  function getItems(activityTypeId: string, baseId?: string | null): MaterialItem[] {
    if (overrides[activityTypeId]) return overrides[activityTypeId];
    const orgItems = baseId ? orgMaterials[baseId] : undefined;
    if (orgItems) return orgItems;
    const spel = baseId ? findSpelByKey(baseId) : null;
    return spel?.materials ?? [];
  }

  function updateItems(activityTypeId: string, items: MaterialItem[]) {
    onUpdateOverrides({ ...overrides, [activityTypeId]: items });
  }

  function resetToDefault(activityTypeId: string) {
    const next = { ...overrides };
    delete next[activityTypeId];
    onUpdateOverrides(next);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {activities.map((activity) => {
        const spel = activity.baseId ? findSpelByKey(activity.baseId) : null;
        const items = getItems(activity.id, activity.baseId);
        const hasOverride = !!overrides[activity.id];
        const isRenamed = !!(activity.baseId && spel && activity.name !== spel.name);

        return (
          <div key={activity.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: "0.92rem" }}>{activity.name}</strong>
              {isRenamed && spel && (
                <span style={{ fontSize: "0.75rem", background: "rgba(212, 64, 23, 0.1)", color: "var(--accent)", padding: "1px 6px", borderRadius: 4 }}>
                  hernoemd van {spel.name}
                </span>
              )}
              {hasOverride && (
                <button type="button" className="btn-sm btn-ghost" onClick={() => resetToDefault(activity.id)} style={{ marginLeft: "auto" }}>
                  Reset naar standaard
                </button>
              )}
              {!hasOverride && !spel && (
                <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "auto" }}>geen standaardlijst</span>
              )}
            </div>

            <div style={{ display: "grid", gap: 4 }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px auto", gap: 6, alignItems: "center" }}>
                  <input
                    value={item.name}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...next[i], name: e.target.value };
                      updateItems(activity.id, next);
                    }}
                    placeholder="Materiaal"
                    style={{ fontSize: "0.85rem", padding: "4px 6px" }}
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...next[i], quantity: Math.max(0, Number(e.target.value) || 0) };
                      updateItems(activity.id, next);
                    }}
                    style={{ fontSize: "0.85rem", padding: "4px 6px", textAlign: "center" }}
                  />
                  <input
                    value={item.unit}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...next[i], unit: e.target.value };
                      updateItems(activity.id, next);
                    }}
                    placeholder="eenheid"
                    style={{ fontSize: "0.85rem", padding: "4px 6px" }}
                  />
                  <button
                    type="button"
                    className="danger-button"
                    style={{ padding: "2px 8px", fontSize: "0.8rem" }}
                    onClick={() => {
                      const next = items.filter((_, j) => j !== i);
                      updateItems(activity.id, next);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-sm btn-ghost"
              style={{ marginTop: 6 }}
              onClick={() => {
                updateItems(activity.id, [...items, { name: "", quantity: 1, unit: "stuks", optional: false }]);
              }}
            >
              + Materiaal
            </button>
          </div>
        );
      })}
    </div>
  );
}

export async function exportMaterialsPdf(
  configName: string,
  stationMaterials: StationMaterials[],
  totals: MaterialTotals[],
  orientation: "landscape" | "portrait" = "portrait"
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkNewPage = (needed: number) => {
    if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
  };

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Materiaallijst — ${configName}`, margin, y + 6);
  y += 14;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Per station", margin, y + 5);
  y += 10;

  for (const station of stationMaterials) {
    if (station.items.length === 0) continue;
    checkNewPage(24);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(station.stationName, margin, y + 4);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const item of station.items) {
      checkNewPage(7);
      doc.setDrawColor(160);
      doc.rect(margin, y, 3.5, 3.5);
      const label = `${item.name} — ${item.quantity} ${item.unit}${item.optional ? " (optioneel)" : ""}`;
      doc.text(label, margin + 6, y + 3);
      y += 6;
    }
    y += 4;
  }

  doc.addPage();
  y = margin;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Totaaloverzicht — alles wat mee moet", margin, y + 5);
  y += 12;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Materiaal", margin + 6, y + 3);
  doc.text("Aantal", margin + contentW - 40, y + 3, { align: "right" });
  doc.text("Eenheid", margin + contentW, y + 3, { align: "right" });
  y += 5;
  doc.setDrawColor(100);
  doc.line(margin, y, margin + contentW, y);
  y += 3;

  doc.setFont("helvetica", "normal");
  for (const item of totals) {
    checkNewPage(7);
    doc.setDrawColor(160);
    doc.rect(margin, y, 3.5, 3.5);
    const label = item.name + (item.optional ? " (optioneel)" : "");
    doc.text(label, margin + 6, y + 3);
    doc.text(String(item.quantity), margin + contentW - 40, y + 3, { align: "right" });
    doc.text(item.unit, margin + contentW, y + 3, { align: "right" });
    y += 6;
  }

  doc.save(`materiaallijst-${configName.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}
