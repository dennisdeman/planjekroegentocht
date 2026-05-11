"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ConfigV2, PlanV2 } from "@core";
import { computeStationMaterials, computeMaterialTotals, type OrgSpelMaterials } from "@core";
import {
  exportRoosterExcel,
  exportRoosterCSV,
  exportRoosterPDF,
  exportGroepsKaartenPDF,
  exportLocatieOverzichtPDF,
  exportScorebordPDF,
  exportScheidsrechtersPDF,
  exportSpelbegeleiderPDF,
  exportDagprogrammaPDF,
} from "@lib/export";
import { exportMaterialsPdf } from "@ui/materials-section";

type ExportTab = "rooster" | "groepen" | "locaties" | "scorebord" | "scheidsrechters" | "spelbegeleiders" | "dagprogramma" | "materialen";

interface ProgramItem {
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  icon: string;
}

interface KroegentochtExportModalProps {
  config: ConfigV2;
  plan: PlanV2;
  kroegentochtId: string;
  onClose: () => void;
}


export function KroegentochtExportModal({ config, plan, kroegentochtId, onClose }: KroegentochtExportModalProps) {
  const [tab, setTab] = useState<ExportTab>("rooster");
  const [pdfOrientation, setPdfOrientation] = useState<"landscape" | "portrait">("landscape");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterSpel, setFilterSpel] = useState("");
  const [programItems, setProgramItems] = useState<ProgramItem[]>([]);
  const [orgMaterials, setOrgMaterials] = useState<OrgSpelMaterials>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/program-items`)
      .then((r) => r.json())
      .then((d) => { if (d.items) setProgramItems(d.items); })
      .catch(() => {});
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
  }, [kroegentochtId]);

  if (!mounted || typeof document === "undefined") return null;

  const tabRows: { key: ExportTab; label: string }[][] = [
    [
      { key: "rooster", label: "Rooster" },
      { key: "materialen", label: "Materialen" },
      { key: "locaties", label: "Locatie-overzicht" },
      { key: "scorebord", label: "Scorebord" },
    ],
    [
      { key: "dagprogramma", label: "Dagprogramma" },
      { key: "groepen", label: "Groepskaarten" },
      { key: "spelbegeleiders", label: "Spelbegeleiders" },
      { key: "scheidsrechters", label: "Scheidsrechters" },
    ],
  ];

  function getFilter() {
    return {
      locationIds: filterLocation ? [filterLocation] : undefined,
      activityTypeIds: filterSpel ? [filterSpel] : undefined,
    };
  }

  // (export functies worden aangeroepen vanuit de knoppen)

  return createPortal(
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="help-modal-card" style={{ width: "min(800px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
        <div className="help-modal-header">
          <h3>Exporteren</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Sluiten</button>
        </div>

        <div style={{ display: "grid", gap: 4, marginBottom: 20 }}>
          {tabRows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 4 }}>
              {row.map((t) => (
                <button key={t.key} type="button" className={tab === t.key ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {tab === "rooster" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Exporteer het volledige rooster of filter op locatie of spel.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ flex: "1 1 160px" }}>
                Locatie
                <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}>
                  <option value="">Alle locaties</option>
                  {config.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label style={{ flex: "1 1 160px" }}>
                Spel
                <select value={filterSpel} onChange={(e) => setFilterSpel(e.target.value)}>
                  <option value="">Alle spellen</option>
                  {config.activityTypes.filter((a) => a.id !== "activity-pause").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            <div className="inline-actions">
              <button type="button" className="btn-primary" onClick={() => exportRoosterExcel(config, plan, getFilter())}>Excel</button>
              <button type="button" className="btn-secondary" onClick={() => exportRoosterCSV(config, plan, getFilter())}>CSV</button>
              <button type="button" className="btn-secondary" onClick={() => exportRoosterPDF(config, plan, getFilter(), pdfOrientation)}>PDF</button>
            </div>
          </div>
        )}

        {tab === "groepen" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Per groep een kaart met alle wedstrijden, locaties en tijden.</p>
            <button type="button" className="btn-primary" onClick={() => exportGroepsKaartenPDF(config, plan, undefined, pdfOrientation)}>PDF downloaden</button>
          </div>
        )}

        {tab === "locaties" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Per locatie alle wedstrijden en groepen.</p>
            <button type="button" className="btn-primary" onClick={() => exportLocatieOverzichtPDF(config, plan, undefined, pdfOrientation)}>PDF downloaden</button>
          </div>
        )}

        {tab === "scorebord" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Leeg scorebord om handmatig in te vullen.</p>
            <button type="button" className="btn-primary" onClick={() => exportScorebordPDF(config, pdfOrientation)}>PDF downloaden</button>
          </div>
        )}

        {tab === "scheidsrechters" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Overzicht per ronde met wedstrijden en locaties.</p>
            <button type="button" className="btn-primary" onClick={() => exportScheidsrechtersPDF(config, plan, undefined, pdfOrientation)}>PDF downloaden</button>
          </div>
        )}

        {tab === "spelbegeleiders" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Per station een overzicht van alle wedstrijden.</p>
            <button type="button" className="btn-primary" onClick={() => exportSpelbegeleiderPDF(config, plan, pdfOrientation)}>PDF downloaden</button>
          </div>
        )}

        {tab === "dagprogramma" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Compleet dagprogramma met rondes, pauzes en eigen items ({programItems.length} items).
            </p>
            <button type="button" className="btn-primary" onClick={() => exportDagprogrammaPDF(config, programItems, pdfOrientation)}>PDF downloaden</button>
          </div>
        )}

        {tab === "materialen" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Checklist met alle benodigde materialen per station en een totaaloverzicht. Inclusief afvinkbare checkboxes.
            </p>
            <div className="inline-actions">
              <button type="button" className="btn-primary" onClick={() => {
                const stations = computeStationMaterials(config, config.materialOverrides, orgMaterials);
                const tots = computeMaterialTotals(stations);
                void exportMaterialsPdf(config.name, stations, tots, pdfOrientation);
              }}>
                PDF downloaden
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 20 }}>
          <span className="muted" style={{ fontSize: "0.78rem" }}>PDF oriëntatie:</span>
          <div className="planner-view-toggle">
            <button type="button" className={pdfOrientation === "landscape" ? "is-active" : ""} onClick={() => setPdfOrientation("landscape")}>Liggend</button>
            <button type="button" className={pdfOrientation === "portrait" ? "is-active" : ""} onClick={() => setPdfOrientation("portrait")}>Staand</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
