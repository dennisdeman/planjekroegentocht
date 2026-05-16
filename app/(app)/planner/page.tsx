"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  applyPatchToConfig,
  buildConfig,
  computePlanScore,
  generateBestPlan,
  generatePlanSummary,
  proposeAlternatives,
  totalRepeatPenalty,
  type Alternative,
} from "@core";
import {
  exportRoosterExcel,
  exportRoosterCSV,
  exportRoosterPDF,
  exportGroepsKaartenPDF,
  exportLocatieOverzichtPDF,
  exportScorebordPDF,
  exportSpelbegeleiderPDF,
} from "@lib/export";
import { computeStationMaterials, computeMaterialTotals, type OrgSpelMaterials } from "@core";
import { exportMaterialsPdf } from "@ui/materials-section";
import { IssuesPanel } from "@ui/planner/issues-panel";
import { PlannerCardView } from "@ui/planner/card-view";
import { PlannerTableView } from "@ui/planner/table-view";
import { NotificationBar } from "@ui/ui/notification-bar";
import { UnsavedChangesGuard } from "@ui/unsaved-changes-guard";
import { usePlannerStore } from "@lib/planner/store";
import { usePlanState } from "@lib/use-plan-state";
import { UpgradeModal } from "@ui/upgrade-modal";
import { PlannerFilters, EMPTY_FILTERS, type PlannerFilterState } from "@ui/planner/planner-filters";
import { GoLiveModal } from "@ui/planner/go-live-modal";
import { createKroegentocht } from "@lib/kroegentochten/api";
import { confirmDialog } from "@ui/ui/confirm-dialog";

const GRID_SNAPSHOT_PREFIX = "kroegentocht.gridSnapshot.v2.";
const configuredAiProvider = process.env.NEXT_PUBLIC_ADVISOR_AI_PROVIDER;
const advisorAiProvider =
  configuredAiProvider === "openai" || configuredAiProvider === "grok" || configuredAiProvider === "claude"
    ? configuredAiProvider
    : "none";

export default function PlannerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Laden...</div>}>
      <PlannerPageInner />
    </Suspense>
  );
}

function PlannerPageInner() {
  const searchParams = useSearchParams();
  const planState = usePlanState();
  const isFrozen = planState.status === "frozen" || planState.status === "expired";
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const configId = searchParams?.get("configId") ?? null;
  const planId = searchParams?.get("planId") ?? null;
  const snapshotId = searchParams?.get("snapshotId") ?? null;
  const gridOnly = searchParams?.get("gridOnly") === "1" || searchParams?.get("gridOnly") === "true";
  const [analysisAlternatives, setAnalysisAlternatives] = useState<Alternative[]>([]);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [applyingAlt, setApplyingAlt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
  const [exportTab, setExportTab] = useState<"rooster" | "groepen" | "locaties" | "scorebord" | "spelbegeleiders" | "materialen">("rooster");
  const [pdfOrientation, setPdfOrientation] = useState<"landscape" | "portrait">("landscape");
  const [exportSelectedGroups, setExportSelectedGroups] = useState<Set<string>>(new Set());
  const [exportSelectedLocations, setExportSelectedLocations] = useState<Set<string>>(new Set());
  const [exportFilterLocation, setExportFilterLocation] = useState<string>("");
  const [exportFilterSpel, setExportFilterSpel] = useState<string>("");
  const [plannerView, setPlannerView] = useState<"grid" | "cards">("grid");
  const [issuesModalOpen, setIssuesModalOpen] = useState(false);
  const [plannerFilters, setPlannerFilters] = useState<PlannerFilterState>(EMPTY_FILTERS);
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const snapshotApplied = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPlannerView("cards");
    }
  }, []);

  const {
    initialized,
    init,
    loadConfig,
    loadPlan,
    loadInlineDraft,
    activeConfig,
    activePlan,
    issues,
    byesByTimeslot,
    uiMessage,
    showMessage,
    applyPlanCommand,
    generatePlan,
    validateCurrentPlan,
    saveCurrent,
    clearMessage,
    planRecords,
    configRecords,
    refreshDashboard,
    deletePlanRecord,
    dashboardLoading,
    dirty,
    newConfig,
  } = usePlannerStore();

  useEffect(() => {
    void init();
    void refreshDashboard();
  }, [init, refreshDashboard]);

  useEffect(() => {
    if (!initialized) {
      return;
    }
    if (!snapshotApplied.current && snapshotId && typeof window !== "undefined") {
      const raw = window.localStorage.getItem(`${GRID_SNAPSHOT_PREFIX}${snapshotId}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { config?: unknown; plan?: unknown };
          if (parsed.config && parsed.plan) {
            loadInlineDraft(parsed.config, parsed.plan);
            snapshotApplied.current = true;
            return;
          }
        } catch {
          showMessage("Kon grid-snapshot niet laden.", "error");
        }
      }
      snapshotApplied.current = true;
    }
    if (planId) {
      void loadPlan(planId);
      return;
    }
    if (configId) {
      void loadConfig(configId);
    }
  }, [initialized, snapshotId, planId, configId, loadConfig, loadPlan, loadInlineDraft, showMessage]);

  const buildOpenGridUrl = useCallback((): string | null => {
    try {
      if (typeof window !== "undefined") {
        const latest = usePlannerStore.getState();
        const latestConfig = latest.activeConfig;
        const latestPlan = latest.activePlan;
        const snapshotIdValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        window.localStorage.setItem(
          `${GRID_SNAPSHOT_PREFIX}${snapshotIdValue}`,
          JSON.stringify({
            config: latestConfig,
            plan: latestPlan,
          })
        );
        void latest.saveCurrent().catch((error) => {
          const message = error instanceof Error ? error.message : "Onbekende fout bij opslaan.";
          showMessage(`Opslaan op achtergrond mislukt: ${message}`, "error");
        });
        const query = new URLSearchParams({
          gridOnly: "1",
          configId: latestConfig.id,
          snapshotId: snapshotIdValue,
        });
        if (latestPlan?.id) {
          query.set("planId", latestPlan.id);
        }
        return `/planner?${query.toString()}`;
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende fout.";
      showMessage(`Kon grid-tab niet openen: ${message}`, "error");
      return null;
    }
  }, [showMessage]);

  const runAnalysis = useCallback(async () => {
    if (!activePlan) {
      showMessage("Genereer eerst een planning voordat je advies vraagt.", "info");
      return;
    }
    setAnalysisBusy(true);
    setAnalysisAlternatives([]);
    setAnalysisOpen(true);
    try {
      const result = await proposeAlternatives(activeConfig, activePlan, {
        maxAlternatives: 5,
      });
      setAnalysisAlternatives(result);
      if (result.length === 0) {
        showMessage("Je planning is al optimaal. Geen verbeteringen gevonden.", "success");
      } else {
        showMessage(`${result.length} alternatieven gevonden.`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analyse mislukt.";
      showMessage(`Analyse fout: ${message}`, "error");
    } finally {
      setAnalysisBusy(false);
    }
  }, [activeConfig, activePlan, showMessage]);

  const applyAlternative = useCallback(
    (alt: Alternative) => {
      setApplyingAlt(alt.id);
      // setTimeout zodat de UI de loading indicator kan renderen
      setTimeout(() => {
        try {
          const newConfig = applyPatchToConfig(activeConfig, alt.apply);
          newConfig.id = activeConfig.id;
          const result = generateBestPlan(newConfig);
          loadInlineDraft(newConfig, result.plan);
          void saveCurrent();
          setAnalysisOpen(false);
          setAnalysisAlternatives([]);
          setApplyingAlt(null);
          showMessage(`"${alt.label}" toegepast. Configuratie en plan zijn bijgewerkt.`, "success");
        } catch (error) {
          setApplyingAlt(null);
          const message = error instanceof Error ? error.message : "Onbekende fout.";
          showMessage(`Toepassen mislukt: ${message}`, "error");
        }
      }, 50);
    },
    [activeConfig, loadInlineDraft, saveCurrent, showMessage]
  );

  // Toon loading tot store + dashboard geladen EN plan geladen (als er een planId in URL staat)
  const isLoading = !initialized || dashboardLoading || (!!planId && !activePlan);

  if (isLoading) {
    return (
      <div className="planner-page" style={{ display: "grid", placeItems: "center", minHeight: 200 }}>
        <p className="muted">Laden...</p>
      </div>
    );
  }

  return (
    <div className="planner-page">
      <UnsavedChangesGuard />
      {uiMessage ? <NotificationBar message={uiMessage.text} type={uiMessage.type} onClose={() => clearMessage()} /> : null}

      {!gridOnly && (configId || planId || activePlan) ? (
        <section className="card">
          <header className="planner-header" style={{ alignItems: "flex-end" }}>
            <div>
              <h2 style={{ marginTop: 0 }}>{activeConfig.name}: <span className="muted" style={{ fontSize: "0.7em", fontWeight: 400 }}>{activeConfig.groups.length} groepen &middot; {activeConfig.stations.length} stations &middot; {activeConfig.timeslots.length} tijdsloten</span></h2>
              {activePlan && (
                <div className="planner-view-toggle" style={{ marginTop: 8 }}>
                  <button type="button" className={plannerView === "grid" ? "is-active" : ""} onClick={() => setPlannerView("grid")}>Grid</button>
                  <button type="button" className={plannerView === "cards" ? "is-active" : ""} onClick={() => setPlannerView("cards")}>Kaarten</button>
                </div>
              )}
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (isFrozen) return;
                  setGenerating(true);
                  setTimeout(async () => { await generatePlan(); setGenerating(false); }, 50);
                }}
                disabled={generating || isFrozen || activeConfig.groups.length === 0 || activeConfig.stations.length === 0 || activeConfig.timeslots.length === 0}
              >
                {generating ? "Bezig met genereren..." : "Opnieuw genereren"}
              </button>
              <button type="button" className="btn-primary" onClick={() => {
                if (!planState.limits.canUseAdvice) { setUpgradeMessage("Het advies-systeem is beschikbaar met Pro Event of Pro Jaar."); return; }
                void runAnalysis();
              }} disabled={analysisBusy || !activePlan}>
                {analysisBusy ? "Analyseren..." : "Advies"}
              </button>
              {activePlan && (
                <button type="button" className="btn-primary" onClick={() => {
                  if (!planState.limits.canGoLive) { setUpgradeMessage("Live-modus is beschikbaar met Pro Event of Pro Jaar."); return; }
                  setGoLiveOpen(true);
                }}>
                  Genereer kroegentocht
                </button>
              )}
              <Link href={`/configurator?configId=${activeConfig.id}`} className="button-link btn-ghost">
                Bewerken
              </Link>
              <button type="button" className="btn-ghost" onClick={() => {
                if (!planState.limits.canExport) { setUpgradeMessage("Export is beschikbaar met Pro Event of Pro Jaar."); return; }
                setExportOpen(true);
              }} disabled={!activePlan}>
                Exporteren
              </button>
              <button type="button" className="btn-ghost" onClick={async () => { if (isFrozen) return; await saveCurrent(); showMessage("Opgeslagen.", "success"); }} disabled={isFrozen}>
                Opslaan
              </button>
              <a href="/planner" className="button-link btn-ghost">
                Sluiten
              </a>
            </div>
          </header>
        </section>
      ) : null}

      {analysisOpen && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAnalysisOpen(false); }}>
          <div className="help-modal-card" style={{ width: "min(560px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
            <div className="help-modal-header">
              <h3>Advies</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAnalysisOpen(false)}>Sluiten</button>
            </div>
            {applyingAlt && (
              <div className="notice notice-info" style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>Planning wordt herberekend... Even geduld.</p>
              </div>
            )}
            {analysisBusy && analysisAlternatives.length === 0 && (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <p className="muted">Planning wordt geanalyseerd...</p>
              </div>
            )}
            {!analysisBusy && analysisAlternatives.length === 0 && (
              <div style={{ padding: "0 0 16px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.9rem" }}>
                  <span>{"\u2705"}</span>
                  <p style={{ margin: 0 }}>Je planning is al optimaal. Er zijn geen betere configuraties gevonden.</p>
                </div>
              </div>
            )}
            {analysisAlternatives.length > 0 && (
              <div style={{ padding: "0 0 16px" }}>
                <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: "0.9rem" }}>
                  {analysisAlternatives.length === 1 ? "Aanbeveling:" : "Kies een optie:"}
                </p>
                {analysisAlternatives.map((alt, i) => (
                  <div key={alt.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", marginBottom: 8, background: i === 0 ? "rgba(34,139,34,0.04)" : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong style={{ fontSize: "0.9rem" }}>
                        {alt.achievedRepeats === 0 ? "\u2705 " : ""}{alt.label}
                      </strong>
                      {i === 0 && <span style={{ fontSize: "0.75rem", background: "rgba(34,139,34,0.12)", color: "#1a6b1a", padding: "2px 8px", borderRadius: 99 }}>aanbevolen</span>}
                      {alt.source === "llm" && <span style={{ fontSize: "0.75rem", background: "rgba(59,130,246,0.12)", color: "#1d4ed8", padding: "2px 8px", borderRadius: 99, marginLeft: 4 }}>AI-suggestie</span>}
                    </div>
                    <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "#666" }}>{alt.reason}</p>
                    <div style={{ display: "flex", gap: 12, fontSize: "0.8rem", color: "#888", marginBottom: 10, flexWrap: "wrap" }}>
                      {activeConfig.scheduleSettings.mode === "solo" ? (
                        <>
                          <span style={{ color: alt.spelCoverage.full === alt.spelCoverage.total ? "#1a6b1a" : undefined }}>
                            {alt.spelCoverage.full === alt.spelCoverage.total
                              ? `Alle ${alt.spelCoverage.total} groepen bezoeken alle kroegen`
                              : `${alt.spelCoverage.full}/${alt.spelCoverage.total} groepen alle kroegen`}
                          </span>
                          {alt.achievedRepeats > 0 && (
                            <span>Kroegen herbezocht: {alt.achievedRepeats}</span>
                          )}
                        </>
                      ) : (
                        <>
                          <span style={{ color: alt.spelCoverage.full === alt.spelCoverage.total ? "#1a6b1a" : undefined }}>
                            {alt.spelCoverage.full === alt.spelCoverage.total
                              ? `Alle ${alt.spelCoverage.total} groepen spelen alle spellen`
                              : `${alt.spelCoverage.full}/${alt.spelCoverage.total} groepen alle spellen`}
                          </span>
                          <span>Herhalingen: {alt.achievedRepeats}</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className={i === 0 ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                      disabled={applyingAlt !== null}
                      onClick={() => applyAlternative(alt)}
                    >
                      {applyingAlt === alt.id ? "Herberekenen..." : "Toepassen"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {exportOpen && activePlan && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setExportOpen(false); }}>
          <div className="help-modal-card" style={{ width: "min(800px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
            <div className="help-modal-header">
              <h3>Exporteren</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setExportOpen(false)}>Sluiten</button>
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {(["rooster", "groepen", "locaties", "scorebord", "spelbegeleiders", "materialen"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={exportTab === tab ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                  onClick={() => setExportTab(tab)}
                >
                  {{ rooster: "Rooster", groepen: "Groepskaarten", locaties: "Locatie-overzicht", scorebord: "Scorebord", spelbegeleiders: "Spelbegeleiders", materialen: "Materialen" }[tab]}
                </button>
              ))}
            </div>

            {exportTab === "rooster" && (
              <div style={{ display: "grid", gap: 12 }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Exporteer het volledige rooster of filter op locatie of spel.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ flex: "1 1 160px" }}>
                    Locatie
                    <select value={exportFilterLocation} onChange={(e) => setExportFilterLocation(e.target.value)}>
                      <option value="">Alle locaties</option>
                      {activeConfig.locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ flex: "1 1 160px" }}>
                    Spel
                    <select value={exportFilterSpel} onChange={(e) => setExportFilterSpel(e.target.value)}>
                      <option value="">Alle spellen</option>
                      {activeConfig.activityTypes.filter((a) => a.id !== "activity-pause").map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="inline-actions">
                  <button type="button" className="btn-primary" onClick={() => {
                    const filter = {
                      locationIds: exportFilterLocation ? [exportFilterLocation] : undefined,
                      activityTypeIds: exportFilterSpel ? [exportFilterSpel] : undefined,
                    };
                    exportRoosterExcel(activeConfig, activePlan, filter);
                  }}>
                    Excel downloaden
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => {
                    const filter = {
                      locationIds: exportFilterLocation ? [exportFilterLocation] : undefined,
                      activityTypeIds: exportFilterSpel ? [exportFilterSpel] : undefined,
                    };
                    exportRoosterCSV(activeConfig, activePlan, filter);
                  }}>
                    CSV downloaden
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => {
                    const filter = {
                      locationIds: exportFilterLocation ? [exportFilterLocation] : undefined,
                      activityTypeIds: exportFilterSpel ? [exportFilterSpel] : undefined,
                    };
                    exportRoosterPDF(activeConfig, activePlan, filter, pdfOrientation);
                  }}>
                    PDF downloaden
                  </button>
                </div>
              </div>
            )}

            {exportTab === "groepen" && (
              <div style={{ display: "grid", gap: 12 }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Elke groep krijgt een eigen pagina met schema, tegenstanders en een kolom voor de score.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      if (exportSelectedGroups.size === activeConfig.groups.length) {
                        setExportSelectedGroups(new Set());
                      } else {
                        setExportSelectedGroups(new Set(activeConfig.groups.map((g) => g.id)));
                      }
                    }}
                  >
                    {exportSelectedGroups.size === activeConfig.groups.length ? "Geen selecteren" : "Alles selecteren"}
                  </button>
                </div>
                <div className="export-checkbox-grid">
                  {activeConfig.groups.map((g) => (
                    <label key={g.id} className="export-checkbox-label">
                      <input
                        type="checkbox"
                        checked={exportSelectedGroups.has(g.id)}
                        onChange={(e) => {
                          const next = new Set(exportSelectedGroups);
                          if (e.target.checked) next.add(g.id);
                          else next.delete(g.id);
                          setExportSelectedGroups(next);
                        }}
                      />
                      <span>{g.name}</span>
                    </label>
                  ))}
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={exportSelectedGroups.size === 0}
                    onClick={() => exportGroepsKaartenPDF(activeConfig, activePlan, [...exportSelectedGroups], pdfOrientation)}
                  >
                    PDF downloaden ({exportSelectedGroups.size} {exportSelectedGroups.size === 1 ? "groep" : "groepen"})
                  </button>
                </div>
              </div>
            )}

            {exportTab === "locaties" && (
              <div style={{ display: "grid", gap: 12 }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Per locatie een pagina met het schema — handig voor de begeleider op dat veld.
                </p>
                <div className="export-checkbox-grid">
                  {activeConfig.locations.map((l) => (
                    <label key={l.id} className="export-checkbox-label">
                      <input
                        type="checkbox"
                        checked={exportSelectedLocations.has(l.id)}
                        onChange={(e) => {
                          const next = new Set(exportSelectedLocations);
                          if (e.target.checked) next.add(l.id);
                          else next.delete(l.id);
                          setExportSelectedLocations(next);
                        }}
                      />
                      <span>{l.name}</span>
                    </label>
                  ))}
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => exportLocatieOverzichtPDF(
                      activeConfig,
                      activePlan,
                      exportSelectedLocations.size > 0 ? [...exportSelectedLocations] : undefined,
                      pdfOrientation
                    )}
                  >
                    PDF downloaden ({exportSelectedLocations.size > 0 ? `${exportSelectedLocations.size} ${exportSelectedLocations.size === 1 ? "locatie" : "locaties"}` : "alle locaties"})
                  </button>
                </div>
              </div>
            )}

            {exportTab === "scorebord" && (
              <div style={{ display: "grid", gap: 12 }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Een leeg scoreformulier met alle groepen. Kolommen voor gewonnen, gelijk, verloren en punten.
                </p>
                <div className="inline-actions">
                  <button type="button" className="btn-primary" onClick={() => exportScorebordPDF(activeConfig, pdfOrientation)}>
                    PDF downloaden
                  </button>
                </div>
              </div>
            )}

            {exportTab === "spelbegeleiders" && (
              <div style={{ display: "grid", gap: 12 }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Per station een compleet pakket: speluitleg, materiaallijst, veldopzet en spelletjeschema met scorekolom.
                </p>
                <div className="inline-actions">
                  <button type="button" className="btn-primary" onClick={() => {
                    void exportSpelbegeleiderPDF(activeConfig, activePlan, pdfOrientation, orgMaterials);
                  }}>
                    PDF downloaden
                  </button>
                </div>
              </div>
            )}

            {exportTab === "materialen" && (
              <div style={{ display: "grid", gap: 12 }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Checklist met alle benodigde materialen per station en een totaaloverzicht. Inclusief afvinkbare checkboxes.
                </p>
                <div className="inline-actions">
                  <button type="button" className="btn-primary" onClick={() => {
                    const stations = computeStationMaterials(activeConfig, activeConfig.materialOverrides, orgMaterials);
                    const tots = computeMaterialTotals(stations);
                    void exportMaterialsPdf(activeConfig.name, stations, tots, pdfOrientation);
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
        </div>
      )}

      {upgradeMessage && <UpgradeModal message={upgradeMessage} onClose={() => setUpgradeMessage(null)} />}

      {activePlan && (
        <GoLiveModal
          open={goLiveOpen}
          firstSlotStartIso={activeConfig.timeslots.filter((t) => t.kind === "active").sort((a, b) => a.index - b.index)[0]?.start ?? null}
          onCancel={() => setGoLiveOpen(false)}
          onConfirm={async (config, startMode, scheduledDatetime, adminName, photosEnabled) => {
            const res = await createKroegentocht(activePlan.id, config, startMode, scheduledDatetime, adminName, photosEnabled);
            setGoLiveOpen(false);
            showMessage(`Kroegentocht aangemaakt. ${res.tokens.length} links gegenereerd.`, "success");
            window.location.href = `/kroegentochten/${res.kroegentocht.id}`;
          }}
        />
      )}

      {!activePlan ? (
        <div style={{ display: "grid", gap: 14 }}>
          {planRecords.length === 0 && (
            <section className="card empty-state">
              {activeConfig.groups.length === 0 || activeConfig.stations.length === 0 || activeConfig.timeslots.length === 0 ? (
                <>
                  <h3>Configuratie niet compleet</h3>
                  <p>Stel eerst groepen, stations en tijdsloten in via de configurator voordat je een planning kunt genereren.</p>
                  <div className="inline-actions" style={{ justifyContent: "center" }}>
                    <Link href="/configurator" className="button-link btn-primary">
                      Naar configurator
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h3>Klaar om te plannen</h3>
                  <p>Je configuratie is compleet. Genereer een planning om het rooster te zien.</p>
                  <div className="inline-actions" style={{ justifyContent: "center" }}>
                    <button type="button" className="btn-primary" onClick={() => generatePlan()}>
                      Genereer planning
                    </button>
                    <Link href="/configurator" className="button-link btn-ghost">
                      Configurator
                    </Link>
                  </div>
                </>
              )}
            </section>
          )}

          {planRecords.length > 0 && (
            <section className="card">
              <h3 style={{ margin: "0 0 10px" }}>Opgeslagen planningen</h3>
              <ul className="simple-list">
                {planRecords.map((record) => {
                  const config = configRecords.find((c) => c.id === record.configId);
                  return (
                    <li key={record.id}>
                      <div>
                        <strong>{config?.config.name ?? "Planning"}</strong>
                        <small>{new Date(record.updatedAtIso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
                      </div>
                      <div className="inline-actions">
                        <button type="button" className="btn-sm btn-primary" onClick={() => void loadPlan(record.id)}>
                          Openen
                        </button>
                        <button type="button" className="btn-sm danger-button" onClick={async () => { if (await confirmDialog({ title: "Planning verwijderen", message: `Planning "${config?.config.name ?? "Planning"}" verwijderen?`, confirmLabel: "Verwijderen", variant: "danger" })) void deletePlanRecord(record.id); }}>
                          Verwijder
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <>
          {gridOnly ? (
            <PlannerTableView
              config={activeConfig}
              plan={activePlan}
              issues={issues}
              byesByTimeslot={byesByTimeslot}
              onOpenInNewTab={buildOpenGridUrl}
              showOpenInNewTabButton={false}
              onCommand={applyPlanCommand}
              onBlockedDrop={(reason) => {
                showMessage(reason);
              }}
            />
          ) : (
            <>
              {issues.length > 0 && (
                <div
                  className={`notice ${issues.some((i) => i.severity === "error") ? "notice-warning" : "notice-success"}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setIssuesModalOpen(true)}
                >
                  <p style={{ margin: 0 }}>
                    <strong>Let op!</strong> Er {issues.length === 1 ? "is" : "zijn"} {issues.length} issue{issues.length !== 1 ? "s" : ""} gevonden.{" "}
                    <span style={{ textDecoration: "underline" }}>Klik hier om te bekijken</span>
                  </p>
                </div>
              )}

              {issuesModalOpen && (
                <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setIssuesModalOpen(false); }}>
                  <div className="help-modal-card" style={{ width: "min(600px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
                    <div className="help-modal-header">
                      <h3>Issues ({issues.length})</h3>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setIssuesModalOpen(false)}>Sluiten</button>
                    </div>
                    <div style={{ marginTop: 8 }} className="issues-modal-content">
                      <IssuesPanel issues={issues} config={activeConfig} />
                    </div>
                  </div>
                </div>
              )}

              <PlannerFilters config={activeConfig} filters={plannerFilters} onChange={setPlannerFilters} />

              {plannerView === "cards" ? (
                <PlannerCardView
                  config={activeConfig}
                  plan={activePlan}
                  issues={issues}
                  byesByTimeslot={byesByTimeslot}
                  filters={plannerFilters}
                />
              ) : (
                <PlannerTableView
                  config={activeConfig}
                  plan={activePlan}
                  issues={issues}
                  byesByTimeslot={byesByTimeslot}
                  onOpenInNewTab={buildOpenGridUrl}
                  onCommand={applyPlanCommand}
                  onBlockedDrop={(reason) => {
                    showMessage(reason);
                  }}
                  filters={plannerFilters}
                />
              )}
            </>
          )}
        </>
      )}

    </div>
  );
}
