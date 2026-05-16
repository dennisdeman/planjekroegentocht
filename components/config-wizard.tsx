"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ConfigV2, PlanSummaryLine, ScheduleMode, Alternative } from "@core";
import { buildConfig, calculateSchedule, computePlanScore, generateBestPlan, generatePlanSummary, hasAlgebraicK, totalRepeatPenalty, proposeAlternatives, getSpelNames } from "@core";
import { VenueSearchModal } from "@ui/venue-search-modal";
import { ManualLocationModal } from "@ui/manual-location-modal";
import { confirmDialog } from "@ui/ui/confirm-dialog";

interface WizardProps {
  onComplete: (config: ConfigV2) => void;
  onCancel: () => void;
}

const FALLBACK_SUGGESTIONS = getSpelNames();

/*
 * Steps:
 * 1. Name
 * 2. Pools (yes/no + names)
 * 3. Groups (count)
 * 4. Movement policy (only with pools, otherwise skipped)
 * 5. Spellen
 * 6. Locations
 * 7. Stations (auto-calculated)
 * 8. Schedule + Rules
 * Summary
 */
const TOTAL_STEPS = 7;

// ── Calculations ───────────────────────────────────────────────────────

// CalcResult and ScheduleMode imported from @core/config-builder

// calculate() is now calculateSchedule() from @core/config-builder

// ── Feasibility check ─────────────────────────────────────────────────

interface FeasibilityResult { repeats: number; summary: PlanSummaryLine[]; totalScore: number; loading: boolean }

// Kosten-constanten verwijderd — zitten nu in alternatives.ts

type LocationLike = string | { name: string; address?: string; lat?: number; lng?: number; phone?: string; website?: string; rating?: number; reviewCount?: number; priceLevel?: string; category?: string; sourceId?: string };

type BaseParams = {
  name: string; usePools: boolean; poolNames: string[];
  movementPolicy: "free" | "blocks"; repeatPolicy: "off" | "soft" | "hard";
  startTime: string; roundDuration: number; transitionTime: number;
  stationLayout: "same" | "split"; locations: LocationLike[];
  scheduleMode: ScheduleMode;
  mode?: "solo" | "vs";
  groupsPerPool?: number[];
};

function buildTrialConfig(
  base: BaseParams,
  spellen: string[],
  groupCount: number,
  layout: "same" | "split",
  locs: LocationLike[],
  scheduleMode?: ScheduleMode,
): ConfigV2 {
  return buildConfig({
    name: base.name,
    usePools: base.usePools,
    poolNames: base.poolNames,
    groupCount,
    groupsPerPool: base.groupsPerPool,
    spellen,
    locations: locs.map((l) => (typeof l === "string" ? { name: l } : l)),
    movementPolicy: base.movementPolicy,
    stationLayout: layout,
    scheduleMode: scheduleMode ?? base.scheduleMode,
    mode: base.mode,
    startTime: base.startTime,
    roundDurationMinutes: base.roundDuration,
    transitionMinutes: base.transitionTime,
    repeatPolicy: base.repeatPolicy,
    enableBreak: false,
  }).config;
}


// findNearestPerfect en buildAlternativeLabel zijn verwijderd — alle
// alternatieven-logica loopt nu via proposeAlternatives uit @core.
// Zie docs/generator-design.md §2.4.

// ── UI Helpers ──────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < current ? "var(--brand)" : "var(--line)", transition: "background 0.2s" }} />
      ))}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice" style={{ border: "1px solid rgba(15, 108, 115, 0.25)", background: "rgba(15, 108, 115, 0.06)", color: "#0a5055", fontSize: "0.88rem", marginTop: 8 }}>
      {children}
    </div>
  );
}

// ── Wizard ──────────────────────────────────────────────────────────────

export function ConfigWizard({ onComplete, onCancel }: WizardProps) {
  const [step, setStep] = useState(1);
  const [spelSuggestions, setSpelSuggestions] = useState(FALLBACK_SUGGESTIONS);

  useEffect(() => {
    fetch("/api/org/spellen")
      .then((r) => r.json())
      .then((d) => {
        const names = (d.spellen ?? [])
          .filter((s: { isActive: boolean }) => s.isActive)
          .map((s: { name: string }) => s.name);
        if (names.length > 0) setSpelSuggestions(names);
      })
      .catch(() => {});
  }, []);

  // Step 1
  const [name, setName] = useState("");
  // Step 2 - Modus + Pools + Spellen-toggle
  const [mode, setMode] = useState<"solo" | "vs">("solo");
  const [gamesEnabled, setGamesEnabled] = useState(true);
  const [usePools, setUsePools] = useState(false);
  const [poolNames, setPoolNames] = useState(["Route A", "Route B"]);
  // Step 3
  const [groupCount, setGroupCount] = useState(6);
  const [groupsPerPool, setGroupsPerPool] = useState<number[]>([3, 3]);
  // Verplaatsbeleid: Blokken-keuze is uit de UI; nieuwe configs zijn altijd 'free'.
  const movementPolicy: "free" | "blocks" = "free";
  // Step 5
  const [spellen, setSpellen] = useState<string[]>([]);
  const [newSpel, setNewSpel] = useState("");
  // Step 5 (schedule mode — shown in step 5 when spellen > rounds)
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("all-spellen");
  // Step 6
  interface WizardLocation {
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    phone?: string;
    website?: string;
    rating?: number;
    reviewCount?: number;
    priceLevel?: string;
    category?: string;
    sourceId?: string;
  }
  const [locations, setLocations] = useState<WizardLocation[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [showVenueSearch, setShowVenueSearch] = useState(false);
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [editingLocationIndex, setEditingLocationIndex] = useState<number | null>(null);
  // Step 7 (stations — auto-generated)
  const [stationLayout, setStationLayout] = useState<"same" | "split">("split");
  const [stationOverrides, setStationOverrides] = useState<Array<{ spel: string; location: string; capacity: number }> | null>(null);
  // Step 7 (schedule + rules)
  const [startTime, setStartTime] = useState("19:30");
  const [roundDuration, setRoundDuration] = useState(30);
  const [transitionTime, setTransitionTime] = useState(10);
  const [repeatPolicy, setRepeatPolicy] = useState<"off" | "soft" | "hard">("soft");
  // Pauze-slot halverwege (eet- of stadsmoment). Default uit — gebruiker schakelt zelf in.
  const [enableBreak, setEnableBreak] = useState(false);
  // Pause activity (bye groups)
  const [pauseActivityName, setPauseActivityName] = useState("");

  // ── Helpers: sync groupsPerPool when groupCount or poolNames change ──

  function distributeGroups(total: number, pools: string[]): number[] {
    const pc = pools.length;
    if (pc <= 1) return [total];
    const base = Math.floor(total / pc);
    const remainder = total % pc;
    return pools.map((_, i) => base + (i < remainder ? 1 : 0));
  }

  function updateGroupCount(newCount: number) {
    setGroupCount(newCount);
    if (usePools) setGroupsPerPool(distributeGroups(newCount, poolNames));
  }

  function updatePoolGroupCount(poolIndex: number, newCount: number) {
    const next = [...groupsPerPool];
    next[poolIndex] = newCount;
    setGroupsPerPool(next);
    setGroupCount(next.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0));
  }

  // ── Derived ───────────────────────────────────────────────────────

  const poolCount = usePools ? poolNames.length : 1;
  const effectiveMovement = usePools ? movementPolicy : "free";
  const actualPoolSizes = usePools ? groupsPerPool : undefined;
  const calc = useMemo(
    () => calculateSchedule(groupCount, poolCount, spellen.length, effectiveMovement, locations.length, scheduleMode, stationLayout, actualPoolSizes, enableBreak),
    [groupCount, poolCount, spellen.length, effectiveMovement, locations.length, scheduleMode, stationLayout, actualPoolSizes, enableBreak]
  );

  const [feasibility, setFeasibility] = useState<FeasibilityResult>({ repeats: 0, summary: [], totalScore: 0, loading: false });

  // Extra rondes bovenop het berekende aantal — voor "+1 speelronde" suggesties
  const [extraRounds, setExtraRounds] = useState(0);

  // Alternatieven state: via proposeAlternatives uit @core
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);

  // Basis-config versie (zonder extraRounds) — voor het resetten van
  // alternatieven en extraRounds bij wijzigingen aan de kern-parameters.
  const baseConfigVersion = useMemo(
    () => JSON.stringify([usePools, poolNames, movementPolicy, repeatPolicy, stationLayout, locations, spellen, groupCount, scheduleMode, groupsPerPool]),
    [usePools, poolNames, movementPolicy, repeatPolicy, stationLayout, locations, spellen, groupCount, scheduleMode, groupsPerPool],
  );
  // Volledige config versie (met extraRounds) — voor feasibility-herberekening.
  const configVersion = useMemo(
    () => JSON.stringify([baseConfigVersion, extraRounds]),
    [baseConfigVersion, extraRounds],
  );
  const lastConfigVersion = React.useRef("");
  const lastBaseConfigVersion = React.useRef("");

  useEffect(() => {
    if (step < 7 || spellen.length === 0 || locations.length === 0) return;
    if (configVersion === lastConfigVersion.current) return;
    lastConfigVersion.current = configVersion;

    // Reset alternatieven en extraRounds alleen als de basis-config
    // verandert (groepen, spellen, layout etc.), niet als alleen
    // extraRounds wijzigt.
    if (baseConfigVersion !== lastBaseConfigVersion.current) {
      lastBaseConfigVersion.current = baseConfigVersion;
      setAlternatives([]);
      setAlternativesLoading(false);
      setExtraRounds(0);
    }
    setFeasibility((prev) => ({ ...prev, loading: true }));

    // 100ms geeft de browser genoeg tijd om de "Wordt geanalyseerd..."
    // loading-state te renderen voordat het CPU-intensieve werk begint.
    const timer = setTimeout(() => {
      let repeats = -1;
      let summary: PlanSummaryLine[] = [];
      let totalScore = 0;
      const config = wizardBuildConfig();
      try {
        const result = generateBestPlan(config);
        repeats = totalRepeatPenalty(result.plan, config);
        const score = computePlanScore(result.plan, config);
        totalScore = score.totalScore;
        summary = generatePlanSummary(result.plan, config, score);
      } catch {
        repeats = -1;
      }

      setFeasibility({ repeats, summary, totalScore, loading: false });
    }, 100);

    return () => clearTimeout(timer);
  }, [step, configVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  function runOptimization() {
    setAlternativesLoading(true);
    setAlternatives([]);
    // setTimeout zodat React eerst de loading-state rendert voordat het
    // CPU-intensieve werk van proposeAlternatives begint.
    setTimeout(async () => {
      try {
        const config = buildTrialConfig(
          { name, usePools, poolNames, movementPolicy, repeatPolicy, startTime, roundDuration, transitionTime, stationLayout, locations, scheduleMode, mode, groupsPerPool: usePools ? groupsPerPool : undefined },
          spellen, groupCount, stationLayout, locations, scheduleMode
        );
        const result = await proposeAlternatives(config, undefined, { maxAlternatives: 5 });
        setAlternatives(result);
      } catch {
        setAlternatives([]);
      } finally {
        setAlternativesLoading(false);
      }
    }, 0);
  }

  const autoStations = useMemo(() => {
    // Capaciteit: Solo = 1 groep per kroeg, Vs = 2 groepen per kroeg.
    const cap = mode === "solo" ? 1 : 2;
    const result: Array<{ spel: string; location: string; capacity: number }> = [];

    const locNames = locations.map((l) => l.name);
    // Movement is altijd 'free': groepeer spellen per locatie (sequentieel).
    const perLoc = Math.ceil(spellen.length / Math.max(locNames.length, 1));
    for (let i = 0; i < spellen.length; i++) {
      result.push({
        spel: spellen[i],
        location: locNames[Math.floor(i / perLoc)] ?? locNames[locNames.length - 1],
        capacity: cap,
      });
    }
    return result;
  }, [spellen, locations, effectiveMovement, usePools, stationLayout, mode]);

  const activeStations = stationOverrides ?? autoStations;

  const schedulePreview = useMemo(() => {
    const [hRaw, mRaw] = startTime.split(":");
    const base = new Date(Date.UTC(2026, 0, 1, Number(hRaw) || 9, Number(mRaw) || 0, 0, 0));
    let cursor = new Date(base);
    const fmt = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const slots: Array<{ label: string; kind: string }> = [];
    let roundNum = 0;
    for (let i = 0; i < calc.totalSlots; i++) {
      const slotNum = i + 1;
      const isBreak = calc.breakAfterSlot > 0 && slotNum === calc.breakAfterSlot + 1;
      const start = new Date(cursor);
      const end = new Date(start.getTime() + roundDuration * 60_000);
      if (!isBreak) roundNum++;
      slots.push({ label: `${fmt(start)} - ${fmt(end)}`, kind: isBreak ? "Pauze" : `Ronde ${roundNum}` });
      if (i < calc.totalSlots - 1) cursor = new Date(end.getTime() + transitionTime * 60_000);
    }
    const lastEnd = new Date(cursor.getTime() + roundDuration * 60_000);
    return { slots, endTime: fmt(lastEnd) };
  }, [startTime, roundDuration, transitionTime, calc.totalSlots, calc.breakAfterSlot]);

  // ── Navigation ────────────────────────────────────────────────────

  function addSpel() {
    const s = newSpel.trim();
    if (s && !spellen.includes(s)) { setSpellen([...spellen, s]); setNewSpel(""); }
  }
  function addLocation() {
    const l = newLocation.trim();
    if (l && !locations.some((x) => x.name === l)) { setLocations([...locations, { name: l }]); setNewLocation(""); }
  }

  const skipSpelKoppeling = mode === "solo" && !gamesEnabled;

  function goNext() {
    let next = step + 1;
    // Skip step 5 (spel-koppeling) bij Solo + spellen-uit.
    if (next === 5 && skipSpelKoppeling) next = 6;
    // Reset station overrides when entering step 6 (Stations + optimalisatie)
    if (next === 6) setStationOverrides(null);
    setStep(Math.min(next, TOTAL_STEPS + 1));
  }
  function goBack() {
    let prev = step - 1;
    if (prev === 5 && skipSpelKoppeling) prev = 4;
    setStep(Math.max(prev, 1));
  }

  // Can we proceed?
  function canGoNext(): boolean {
    if (step === 4 && locations.length === 0) return false;
    if (step === 5 && !skipSpelKoppeling && spellen.filter(Boolean).length < locations.length) return false;
    return true;
  }

  // ── Build config ──────────────────────────────────────────────────

  function wizardBuildConfig(): ConfigV2 {
    // Bij Solo + spellen-uit: bouw met placeholder-spel "Kroegbezoek" zodat
    // buildConfig 1 station per kroeg maakt; herschrijf daarna naar de
    // activity-kroegbezoek conventie die de rest van de app verwacht.
    const isKroegbezoekOnly = mode === "solo" && !gamesEnabled;
    const effectiveSpellen = isKroegbezoekOnly ? ["Kroegbezoek"] : spellen;

    const config = buildConfig({
      name,
      usePools,
      poolNames,
      groupCount,
      groupsPerPool: usePools ? groupsPerPool : undefined,
      spellen: effectiveSpellen,
      locations,
      movementPolicy,
      stationLayout,
      scheduleMode,
      mode,
      startTime,
      roundDurationMinutes: roundDuration,
      transitionMinutes: transitionTime,
      repeatPolicy,
      stationOverrides: isKroegbezoekOnly ? undefined : (stationOverrides ?? undefined),
      pauseActivityName: calc.hasBye && pauseActivityName ? pauseActivityName : undefined,
      enableBreak,
    }).config;

    // Extra rondes toevoegen (vanuit "+N speelronde" suggesties)
    if (extraRounds > 0) {
      const activeSlots = config.timeslots
        .filter((s) => s.kind === "active")
        .sort((a, b) => a.index - b.index);
      const lastActive = activeSlots[activeSlots.length - 1];
      if (lastActive) {
        for (let i = 0; i < extraRounds; i++) {
          const newId = `slot-extra-${i + 1}`;
          config.timeslots.push({
            id: newId,
            start: lastActive.end,
            end: lastActive.end,
            label: `Extra ronde ${i + 1}`,
            kind: "active",
            index: lastActive.index + i + 1,
          });
          if (config.locationBlocks && config.locationBlocks.length > 0) {
            config.locationBlocks[config.locationBlocks.length - 1].timeslotIds.push(newId);
          }
        }
      }
    }

    if (isKroegbezoekOnly) {
      // Vervang de placeholder-activityType door de canonieke kroegbezoek-id.
      const placeholder = config.activityTypes.find((a) => a.name === "Kroegbezoek");
      if (placeholder) {
        config.activityTypes = config.activityTypes
          .filter((a) => a.id !== placeholder.id)
          .concat({ id: "activity-kroegbezoek", name: "Kroegbezoek", baseId: null });
        config.stations = config.stations.map((s) =>
          s.activityTypeId === placeholder.id ? { ...s, activityTypeId: "activity-kroegbezoek" } : s
        );
      }
      config.gamesEnabled = false;
    } else {
      config.gamesEnabled = true;
    }

    return config;
  }

  const isSummary = step > TOTAL_STEPS;

  return (
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="help-modal-card" style={{ width: "min(560px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
        <div className="help-modal-header" style={{ marginBottom: 14 }}>
          <h3>{isSummary ? "Samenvatting" : `Stap ${step} van ${TOTAL_STEPS}`}</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Sluiten</button>
        </div>
        <StepIndicator current={step} total={TOTAL_STEPS} />

        {/* Step 1: Name */}
        {step === 1 && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Hoe heet je kroegentocht?</h3>
            <p className="muted" style={{ margin: 0 }}>Deze naam zie je terug op het dashboard en in de planner.</p>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Kroegentocht 2026" autoFocus />
          </div>
        )}

        {/* Step 2: Pools */}
        {step === 2 && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Hoe spelen de groepen?</h3>
            <p className="muted" style={{ margin: 0 }}>
              Solo of een onderlinge strijd? Dit bepaalt het hele rooster — bij Vs ontmoeten teams elkaar in dezelfde kroeg.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                type="button"
                className={mode === "solo" ? "start-mode-option is-active" : "start-mode-option"}
                onClick={() => setMode("solo")}
                style={{ textAlign: "left" }}
              >
                Solo — elke groep loopt apart
                <small>Een groep is per ronde alleen in een kroeg en speelt het spel daar. Score per groep, geen tegenstanders.</small>
              </button>
              <button
                type="button"
                className={mode === "vs" ? "start-mode-option is-active" : "start-mode-option"}
                onClick={() => setMode("vs")}
                style={{ textAlign: "left" }}
              >
                Vs — twee groepen ontmoeten elkaar
                <small>Twee groepen komen samen in een kroeg en spelen tegen elkaar. Klassieke winst/gelijk/verlies-scoring.</small>
              </button>
            </div>

            {mode === "solo" && (
              <>
                <h3 style={{ margin: "16px 0 0" }}>Spellen in de tocht?</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Wil je per kroeg een drankspel koppelen, of is het puur een kroegentocht zonder spellen?
                </p>
                <div style={{ display: "grid", gap: 8 }}>
                  <button
                    type="button"
                    className={gamesEnabled ? "start-mode-option is-active" : "start-mode-option"}
                    onClick={() => setGamesEnabled(true)}
                    style={{ textAlign: "left" }}
                  >
                    🎮 Met spellen (aanbevolen)
                    <small>Elke kroeg krijgt een spel. Spellen worden automatisch gekoppeld, je kunt ze daarna wijzigen.</small>
                  </button>
                  <button
                    type="button"
                    className={!gamesEnabled ? "start-mode-option is-active" : "start-mode-option"}
                    onClick={() => setGamesEnabled(false)}
                    style={{ textAlign: "left" }}
                  >
                    🍻 Pure kroegentocht
                    <small>Geen drankspellen. Groepen bezoeken kroegen in volgorde zonder activiteit.</small>
                  </button>
                </div>
              </>
            )}

            <h3 style={{ margin: "16px 0 0" }}>Wil je pools gebruiken?</h3>
            <p className="muted" style={{ margin: 0 }}>
              Pools zijn parallelle routes binnen je kroegentocht. Bij grote groepen kan je twee routes naast elkaar laten lopen
              zodat de stad niet vol staat. Voor de meeste kroegentochten is &apos;Nee&apos; de juiste keuze.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={!usePools ? "btn-primary" : "btn-ghost"} onClick={() => setUsePools(false)}>Nee, één route (aanbevolen)</button>
              <button type="button" className={usePools ? "btn-primary" : "btn-ghost"} onClick={() => setUsePools(true)}>Ja, meerdere routes</button>
            </div>
            {usePools && (
              <div style={{ marginTop: 8 }}>
                <label>Route-namen</label>
                {poolNames.map((pn, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    <input value={pn} onChange={(e) => { const next = [...poolNames]; next[i] = e.target.value; setPoolNames(next); }} />
                    {poolNames.length > 2 && <button type="button" className="btn-sm danger-button" onClick={async () => {
                      const ok = await confirmDialog({ title: "Route verwijderen", message: `Route "${pn}" verwijderen?`, confirmLabel: "Verwijder", variant: "danger" });
                      if (!ok) return;
                      const nextNames = poolNames.filter((_, j) => j !== i);
                      setPoolNames(nextNames);
                      setGroupsPerPool(distributeGroups(groupCount, nextNames));
                    }}>X</button>}
                  </div>
                ))}
                <button type="button" className="btn-sm btn-ghost" onClick={() => {
                  const nextNames = [...poolNames, `Route ${String.fromCharCode(65 + poolNames.length)}`];
                  setPoolNames(nextNames);
                  setGroupsPerPool(distributeGroups(groupCount, nextNames));
                }}>+ Route</button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Groups */}
        {step === 3 && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Hoeveel groepen doen er mee?</h3>
            <p className="muted" style={{ margin: 0 }}>Een groep is een team dat samen de kroegen aanloopt.</p>
            {!usePools ? (
              <>
                <input type="number" min={2} value={groupCount} onChange={(e) => updateGroupCount(Number(e.target.value) || 0)} onBlur={() => { if (groupCount < 2) updateGroupCount(2); }} />
                <InfoBox>
                  <p style={{ margin: 0 }}>
                    {groupCount} groepen in één competitie.
                    {" "}Dit geeft <strong>{calc.roundsNeeded} speelrondes</strong>
                    {calc.hasBye ? " (1 groep rust per ronde)" : ""}.
                    Per ronde zijn er {calc.matchesPerRound} spelletjes.
                  </p>
                </InfoBox>
              </>
            ) : (
              <>
                <div style={{ display: "grid", gap: 6 }}>
                  {poolNames.map((pn, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ minWidth: 80, fontSize: "0.9rem", fontWeight: 500 }}>{pn}:</span>
                      <input
                        type="number"
                        min={2}
                        value={Number.isFinite(groupsPerPool[i]) ? groupsPerPool[i] : ""}
                        onChange={(e) => updatePoolGroupCount(i, e.target.value === "" ? NaN : Number(e.target.value))}
                        onBlur={() => { const v = groupsPerPool[i]; if (!Number.isFinite(v) || v < 2) updatePoolGroupCount(i, 2); }}
                        style={{ width: 70 }}
                      />
                      <span className="muted" style={{ fontSize: "0.82rem" }}>groepen</span>
                    </div>
                  ))}
                </div>
                <InfoBox>
                  <p style={{ margin: 0 }}>
                    Totaal: <strong>{groupCount} groepen</strong> verdeeld over {poolCount} pools.
                    {" "}Dit geeft <strong>{calc.roundsNeeded} speelrondes</strong>
                    {calc.hasBye ? " (1 groep rust per ronde)" : ""}.
                    Per ronde zijn er {calc.matchesPerRound} spelletjes per pool.
                  </p>
                </InfoBox>
                <div
                  className="notice notice-warning"
                  style={{
                    marginTop: 8,
                    visibility: groupsPerPool.some((gpp) => gpp % 2 === 1) ? "visible" : "hidden",
                  }}
                  aria-hidden={!groupsPerPool.some((gpp) => gpp % 2 === 1)}
                >
                  <p style={{ margin: 0, fontSize: "0.85rem" }}>
                    Een pool met een oneven aantal groepen betekent dat er elke ronde 1 groep rust.
                    Even aantallen per pool (bijv. {poolNames.map(() => Math.floor(groupCount / poolCount / 2) * 2 || 4).join(", ")}) geven een beter rooster.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Kroegen */}
        {step === 4 && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Welke kroegen worden bezocht?</h3>
            <p className="muted" style={{ margin: 0 }}>
              Elke kroeg krijgt straks 1 spel toegewezen. Gebruik <strong>Zoek kroegen</strong> om
              kroegen via Google te zoeken, of voeg handmatig namen toe.
              {mode === "solo"
                ? ` Bij Solo-modus heb je minimaal ${groupCount} kroegen nodig (1 per groep per ronde).`
                : ` Bij Vs-modus heb je minimaal ${Math.ceil(groupCount / 2)} kroegen nodig (2 groepen per kroeg).`}
            </p>
            <div>
              {locations.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 6, marginBottom: 4, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{l.name || <em className="muted">(naamloos)</em>}</div>
                    {(l.address || l.rating != null) && (
                      <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                        {l.address ?? ""}{l.rating != null ? ` · ${l.rating.toFixed(1)}⭐${l.reviewCount ? ` (${l.reviewCount})` : ""}` : ""}
                      </div>
                    )}
                  </div>
                  <button type="button" className="btn-sm btn-ghost" onClick={() => setEditingLocationIndex(i)}>✏️</button>
                  {locations.length > 1 && (
                    <button
                      type="button"
                      className="btn-sm danger-button"
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: "Kroeg verwijderen",
                          message: `Kroeg "${l.name || `#${i + 1}`}" verwijderen?`,
                          confirmLabel: "Verwijder",
                          variant: "danger",
                        });
                        if (!ok) return;
                        setLocations(locations.filter((_, j) => j !== i));
                      }}
                    >
                      X
                    </button>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button type="button" className="btn-sm" onClick={() => setShowManualLocation(true)}>+ Kroeg toevoegen</button>
                <button type="button" className="btn-sm btn-ghost" onClick={() => setShowVenueSearch(true)}>🔍 Zoek meerdere kroegen tegelijk</button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Spel per kroeg (1-op-1 mapping). Skip bij Solo + spellen-uit. */}
        {step === 5 && !(mode === "solo" && !gamesEnabled) && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Welk spel speel je in elke kroeg?</h3>
            <p className="muted" style={{ margin: 0 }}>
              Kies per kroeg een spel uit de bibliotheek, of klik <strong>Vul automatisch</strong> om
              ze in volgorde toe te wijzen.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                className="btn-sm btn-ghost"
                onClick={() => {
                  // Vul automatisch: 1 spel per locatie, in volgorde uit de bibliotheek (cyclisch indien nodig).
                  if (locations.length === 0 || spelSuggestions.length === 0) return;
                  const next: string[] = [];
                  for (let i = 0; i < locations.length; i++) {
                    next.push(spelSuggestions[i % spelSuggestions.length]);
                  }
                  setSpellen(next);
                }}
              >
                ✨ Vul automatisch
              </button>
              {spelSuggestions.length === 0 && (
                <span className="muted" style={{ fontSize: "0.82rem", alignSelf: "center" }}>
                  Geen spellen in je bibliotheek. Voeg ze toe via Configurator → Spellen.
                </span>
              )}
            </div>
            <div>
              {locations.length === 0 ? (
                <p className="muted">Voeg eerst kroegen toe in de vorige stap.</p>
              ) : (
                locations.map((l, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{l.name}</div>
                      {l.address && <div className="muted" style={{ fontSize: "0.78rem" }}>{l.address}</div>}
                    </div>
                    <select
                      value={spellen[i] ?? ""}
                      onChange={(e) => {
                        const next = [...spellen];
                        while (next.length <= i) next.push("");
                        next[i] = e.target.value;
                        setSpellen(next);
                      }}
                    >
                      <option value="">— kies een spel —</option>
                      {spelSuggestions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
            {locations.length > 0 && spellen.filter(Boolean).length < locations.length && (
              <div className="notice notice-warning" style={{ marginTop: 8 }}>
                <p style={{ margin: 0 }}>Nog niet alle kroegen hebben een spel toegewezen.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Je kroegentocht (stations + optimalisatie) */}
        {step === 6 && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Je kroegentocht</h3>

            {extraRounds > 0 && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(59,130,246,0.06)", borderRadius: 6, border: "1px solid rgba(59,130,246,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  +{extraRounds} extra speelronde{extraRounds > 1 ? "s" : ""} toegevoegd ({calc.roundsNeeded + extraRounds} rondes totaal)
                </p>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setExtraRounds(0)}>Reset</button>
              </div>
            )}

            {feasibility.loading && (
              <InfoBox><p style={{ margin: 0 }}>Wordt geanalyseerd...</p></InfoBox>
            )}

            {!feasibility.loading && feasibility.repeats === -1 && (
              <div className="notice notice-warning" style={{ marginTop: 8 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Deze configuratie kan niet worden opgelost met de huidige regels.</p>
              </div>
            )}

            {!feasibility.loading && feasibility.summary.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "0.9rem" }}>Analyse van je kroegentocht:</p>
                {feasibility.summary.map((line, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4, fontSize: "0.85rem" }}>
                    <span style={{ flexShrink: 0 }}>
                      {line.severity === "good" ? "\u2705" : line.severity === "warn" ? "\u26A0\uFE0F" : "\u2139\uFE0F"}
                    </span>
                    <span>{line.text}</span>
                  </div>
                ))}
              </div>
            )}

            {(() => {
              // Solo-aware "perfect"-check: stationOccupancy (en daarmee totalScore)
              // is mathematisch begrensd in Solo (zeker bij 1-groep) — geen geldige metric.
              // Voor Solo: 0 herhalingen + geen mismatch tussen groepen/kroegen/slots = perfect.
              const isSolo = mode === "solo";
              const noWarnings = feasibility.summary.every((l) => l.severity !== "warn");
              const stationCount = autoStations.length;
              const noMismatch = groupCount > 0 && stationCount > 0 && groupCount <= stationCount;
              const isPerfect = isSolo
                ? feasibility.repeats === 0 && noWarnings && noMismatch
                : feasibility.repeats === 0 && feasibility.totalScore >= 10 && noWarnings;
              // Kroegbezoek-only: geen alternatieven nodig — er zijn geen spellen om te variëren.
              const skipAlternatives = isSolo && !gamesEnabled;

              if (feasibility.loading) return null;
              if (feasibility.repeats < 0) return null;

              if (isPerfect) {
                return (
                  <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(34,139,34,0.06)", borderRadius: 6, border: "1px solid rgba(34,139,34,0.2)" }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                      &#x2705; Perfecte configuratie! Geen aanpassingen nodig.
                    </p>
                  </div>
                );
              }
              if (skipAlternatives) return null;
              if (alternatives.length > 0 || alternativesLoading) return null;
              return (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={runOptimization}
                    disabled={alternativesLoading}
                    style={{ width: "100%" }}
                  >
                    Optimaliseer mijn kroegentocht
                  </button>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.78rem" }}>
                    We zoeken een betere configuratie door groepen, spellen en {isSolo ? "rondes" : "layout"} te variëren.
                  </p>
                </div>
              );
            })()}

            {alternativesLoading && (
              <InfoBox><p style={{ margin: 0 }}>Bezig met optimaliseren...</p></InfoBox>
            )}

            {/* Alternatieven-lijst */}
            {alternatives.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "0.9rem" }}>Aanbevolen configuraties:</p>
                {alternatives.map((alt) => (
                  <div key={alt.id} style={{ marginBottom: 8, padding: "10px 14px", background: "rgba(34,139,34,0.06)", borderRadius: 6, border: "1px solid rgba(34,139,34,0.2)" }}>
                    <div style={{ fontSize: "0.85rem", marginBottom: 6 }}>
                      <div style={{ fontWeight: 500 }}>
                        {alt.spelCoverage.full === alt.spelCoverage.total ? "\u2705 " : ""}{alt.label}
                      </div>
                      <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>{alt.reason}</div>
                      <div style={{ fontSize: "0.78rem", marginTop: 4, color: alt.spelCoverage.full === alt.spelCoverage.total ? "#1a6b1a" : "#888" }}>
                        {mode === "solo" ? (
                          alt.spelCoverage.full === alt.spelCoverage.total
                            ? `Alle ${alt.spelCoverage.total} groepen bezoeken alle kroegen`
                            : `${alt.spelCoverage.full}/${alt.spelCoverage.total} groepen alle kroegen`
                        ) : (
                          alt.spelCoverage.full === alt.spelCoverage.total
                            ? `Alle ${alt.spelCoverage.total} groepen spelen alle spellen`
                            : `${alt.spelCoverage.full}/${alt.spelCoverage.total} groepen spelen alle spellen`
                        )}
                        {alt.achievedRepeats > 0 ? ` \u00B7 ${alt.achievedRepeats} ${mode === "solo" ? "kroeg herbezocht" : "herhaling"}${alt.achievedRepeats !== 1 ? "en" : ""}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn-primary btn-sm" onClick={() => {
                        if (alt.apply.groupCount != null) updateGroupCount(alt.apply.groupCount);
                        if (alt.apply.spellen) setSpellen(alt.apply.spellen);
                        if (alt.apply.stationLayout) { setStationLayout(alt.apply.stationLayout); setStationOverrides(null); }
                        if (alt.apply.scheduleMode) setScheduleMode(alt.apply.scheduleMode);
                        // movementPolicy genegeerd: wizard ondersteunt geen blocks-mode meer.
                        if (alt.apply.addTimeslots) setExtraRounds(alt.apply.addTimeslots);
                        if (alt.apply.addPauseActivity) setPauseActivityName(alt.apply.addPauseActivity);
                        setAlternatives([]);
                      }}>Toepassen</button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setAlternatives([])}>
                        Nee, behoud huidige
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!feasibility.loading && calc.hasBye && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(15, 108, 115, 0.04)", borderRadius: 6, border: "1px solid rgba(15, 108, 115, 0.12)" }}>
                <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "#666" }}>Geef de rustende groep een activiteit:</p>
                <input
                  type="text"
                  value={pauseActivityName}
                  onChange={(e) => setPauseActivityName(e.target.value)}
                  placeholder="Bijv. Puzzels & Quiz (leeg = geen activiteit)"
                  style={{ width: "100%", fontSize: "0.85rem" }}
                />
                {pauseActivityName && (
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.78rem" }}>
                    Er wordt een pauze-station aangemaakt: de rustende groep doet &quot;{pauseActivityName}&quot; in plaats van stilzitten.
                  </p>
                )}
              </div>
            )}

            {/* Stations-overzicht: alleen tonen als er iets te tweaken valt.
                Solo + kroegbezoek = 1 kroegbezoek-station per kroeg, automatisch — geen UI nodig. */}
            {!(mode === "solo" && !gamesEnabled) && (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  Er worden <strong>{activeStations.length} stations</strong> aangemaakt.
                  {mode === "vs" ? " Je kunt spellen verplaatsen naar een ander veld of capaciteit aanpassen." : " Je kunt spellen verplaatsen naar een andere kroeg."}
                </p>
                {locations.map((loc) => {
                  const stationsForLoc = activeStations
                    .map((s, i) => ({ ...s, origIndex: i }))
                    .filter((s) => s.location === loc.name);
                  if (stationsForLoc.length === 0) return null;
                  return (
                    <div key={loc.name} style={{ marginBottom: 12 }}>
                      <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: "0.85rem" }}>{loc.name} ({stationsForLoc.length} station{stationsForLoc.length !== 1 ? "s" : ""})</p>
                      {stationsForLoc.map((s) => (
                        <div key={s.origIndex} style={{ display: "flex", gap: 6, marginBottom: 3, alignItems: "center", paddingLeft: 8 }}>
                          <span style={{ flex: "1 1 120px", fontSize: "0.88rem" }}>{s.spel}</span>
                          {locations.length > 1 && (
                            <select value={s.location} onChange={(e) => {
                              const next = [...activeStations];
                              next[s.origIndex] = { ...next[s.origIndex], location: e.target.value };
                              setStationOverrides(next);
                            }} style={{ flex: "0 0 110px", fontSize: "0.85rem" }}>
                              {locations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                            </select>
                          )}
                          {mode === "vs" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "0 0 80px" }}>
                              <span className="muted" style={{ fontSize: "0.75rem" }}>cap:</span>
                              <input type="number" min={1} max={10} value={s.capacity} onChange={(e) => {
                                const v = Number(e.target.value) || 0;
                                const next = [...activeStations];
                                next[s.origIndex] = { ...next[s.origIndex], capacity: v };
                                setStationOverrides(next);
                              }} onBlur={() => {
                                if (s.capacity < 1) {
                                  const next = [...activeStations];
                                  next[s.origIndex] = { ...next[s.origIndex], capacity: 1 };
                                  setStationOverrides(next);
                                }
                              }} style={{ width: 45, fontSize: "0.85rem" }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Step 7: Schedule + Rules */}
        {step === 7 && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Tijdschema</h3>
            <p className="muted" style={{ margin: 0 }}>
              Er zijn <strong>{calc.roundsNeeded} speelrondes</strong> nodig
              {calc.breakAfterSlot > 0 ? `, met een pauze na ronde ${calc.breakAfterSlot}` : ""}.
            </p>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <label>Starttijd<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
              <label>Duur per ronde (min)<input type="number" min={5} value={roundDuration} onChange={(e) => setRoundDuration(Number(e.target.value) || 0)} onBlur={() => { if (roundDuration < 5) setRoundDuration(5); }} /></label>
              <label>Wisseltijd (min)<input type="number" min={0} value={transitionTime} onChange={(e) => setTransitionTime(Number(e.target.value) || 0)} /></label>
            </div>
            <label className="toggle-field" style={{ marginTop: 4 }} title="Voegt een pauze-slot toe halverwege de tocht (bv. eten of stadsmoment). Bij ≥4 rondes.">
              <input type="checkbox" checked={enableBreak} onChange={(e) => setEnableBreak(e.target.checked)} />
              <span>☕ Pauze halverwege de tocht</span>
            </label>
            <InfoBox>
              <p style={{ margin: "0 0 4px" }}><strong>Programma:</strong></p>
              {schedulePreview.slots.map((s, i) => (
                <p key={i} style={{ margin: "2px 0", fontSize: "0.82rem" }}>
                  {s.kind === "Pauze" ? "\u2615" : "\uD83C\uDF7B"} {s.label} — {s.kind}
                </p>
              ))}
              <p style={{ margin: "6px 0 0", fontWeight: 600, fontSize: "0.85rem" }}>Einde: {schedulePreview.endTime}</p>
            </InfoBox>

            <h3 style={{ margin: "12px 0 0" }}>Regels</h3>
            {mode === "vs" && (
              <InfoBox>
                <p style={{ margin: 0 }}>
                  {calc.matchupMaxNeeded === 1
                    ? "Elke groep speelt maximaal 1x tegen dezelfde tegenstander."
                    : `Met ${calc.roundsNeeded} rondes en ${calc.roundRobinRounds} unieke tegenstanders spelen sommige groepen ${calc.matchupMaxNeeded}x tegen dezelfde tegenstander.`}
                </p>
              </InfoBox>
            )}
            {!(mode === "solo" && !gamesEnabled) && (
              <label>
                {mode === "solo" ? "Dezelfde kroeg herbezoeken" : "Herhaling van hetzelfde spel"}
                <select value={repeatPolicy} onChange={(e) => setRepeatPolicy(e.target.value as "off" | "soft" | "hard")}>
                  <option value="off">Toestaan</option>
                  <option value="soft">Liever niet (waarschuwing)</option>
                  <option value="hard">Verbieden</option>
                </select>
                <small className="muted">
                  {mode === "solo" ? (
                    <>
                      {repeatPolicy === "off" && "Groepen mogen kroegen herbezoeken als er meer slots dan kroegen zijn."}
                      {repeatPolicy === "soft" && "De planner probeert kroegen niet te herbezoeken, maar mag het als nodig."}
                      {repeatPolicy === "hard" && "De planner weigert als een groep een kroeg twee keer zou bezoeken. Generatie kan falen bij meer slots dan kroegen."}
                    </>
                  ) : (
                    <>
                      {repeatPolicy === "off" && "Groepen mogen hetzelfde spel vaker doen."}
                      {repeatPolicy === "soft" && "De planner probeert herhalingen te vermijden, maar blokkeert niet."}
                      {repeatPolicy === "hard" && "De planner weigert als een groep hetzelfde spel twee keer doet."}
                    </>
                  )}
                </small>
              </label>
            )}
          </div>
        )}

        {/* Summary */}
        {isSummary && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Alles klaar!</h3>
            <p className="muted" style={{ margin: 0 }}>Controleer je keuzes.</p>
            <div style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
              <div><strong>Naam:</strong> {name || "Nieuwe kroegentocht"}</div>
              <div><strong>Modus:</strong> {mode === "solo" ? "Solo" : "Vs"}{mode === "solo" && !gamesEnabled ? " · pure kroegentocht (geen spellen)" : ""}</div>
              <div><strong>Routes:</strong> {usePools ? poolNames.join(", ") : "Eén route"}</div>
              <div><strong>Groepen:</strong> {groupCount}{usePools ? ` (${groupsPerPool.join(" + ")} per route)` : ""}</div>
              {gamesEnabled && <div><strong>Spellen:</strong> {spellen.join(", ")}</div>}
              <div><strong>Kroegen:</strong> {locations.map((l) => l.name).join(", ")}</div>
              <div><strong>Stations:</strong> {activeStations.length}</div>
              <div><strong>Rondes:</strong> {calc.roundsNeeded} ({roundDuration} min, {transitionTime} min wissel){calc.breakAfterSlot > 0 ? `, pauze na ronde ${calc.breakAfterSlot}` : ""}</div>
              <div><strong>Tijden:</strong> {schedulePreview.slots[0]?.label.split(" - ")[0]} tot {schedulePreview.endTime}</div>
              {pauseActivityName && <div><strong>Pauze-activiteit:</strong> {pauseActivityName}</div>}
              {mode === "vs" && <div><strong>Tegenstander max:</strong> {calc.matchupMaxNeeded}x</div>}
              <div><strong>Herhaalde spellen:</strong> {repeatPolicy === "off" ? "Toestaan" : repeatPolicy === "soft" ? "Waarschuwing" : "Verbieden"}</div>
            </div>

            {feasibility.loading && (
              <InfoBox><p style={{ margin: 0 }}>Haalbaarheid wordt gecontroleerd...</p></InfoBox>
            )}

            {!feasibility.loading && feasibility.summary.length > 0 && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(15, 108, 115, 0.04)", borderRadius: 6, border: "1px solid rgba(15, 108, 115, 0.12)" }}>
                <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: "0.9rem" }}>Kwaliteitsanalyse:</p>
                {feasibility.summary.map((line, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4, fontSize: "0.85rem" }}>
                    <span style={{ flexShrink: 0 }}>
                      {line.severity === "good" ? "\u2705" : line.severity === "warn" ? "\u26A0\uFE0F" : "\u2139\uFE0F"}
                    </span>
                    <span>{line.text}</span>
                  </div>
                ))}
                {feasibility.repeats > 0 && (
                  <p style={{ margin: "8px 0 0", fontSize: "0.82rem", fontStyle: "italic" }}>
                    Je kunt doorgaan — de planner optimaliseert het rooster zo goed mogelijk.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="inline-actions" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <div>{step > 1 && <button type="button" className="btn-ghost" onClick={goBack}>Vorige</button>}</div>
          <div className="inline-actions">
            {!isSummary ? (
              <button type="button" className="btn-primary" onClick={goNext} disabled={!canGoNext() || feasibility.loading}>Volgende</button>
            ) : (
              <button type="button" className="btn-primary" onClick={() => onComplete(wizardBuildConfig())} disabled={feasibility.loading}>Configuratie aanmaken</button>
            )}
          </div>
        </div>
      </div>

      {showManualLocation && (
        <ManualLocationModal
          onClose={() => setShowManualLocation(false)}
          onSave={(loc) => {
            setLocations([
              ...locations,
              {
                name: loc.name,
                address: loc.address,
                lat: loc.lat,
                lng: loc.lng,
                phone: loc.phone,
                website: loc.website,
                rating: loc.rating,
                reviewCount: loc.reviewCount,
                priceLevel: loc.priceLevel,
                category: loc.category,
                sourceId: loc.sourceId,
              },
            ]);
          }}
        />
      )}

      {editingLocationIndex !== null && locations[editingLocationIndex] && (
        <ManualLocationModal
          initial={locations[editingLocationIndex]}
          onClose={() => setEditingLocationIndex(null)}
          onSave={(loc) => {
            const next = [...locations];
            next[editingLocationIndex] = { ...loc };
            setLocations(next);
          }}
        />
      )}

      {showVenueSearch && (
        <VenueSearchModal
          onClose={() => setShowVenueSearch(false)}
          existingSourceIds={locations.map((l) => l.sourceId).filter((id): id is string => Boolean(id))}
          onAdd={(venues) => {
            setLocations([
              ...locations,
              ...venues.map((v) => ({
                name: v.name,
                address: v.address,
                lat: v.lat,
                lng: v.lng,
                phone: v.phone,
                website: v.website,
                rating: v.rating,
                reviewCount: v.reviewCount,
                priceLevel: v.priceLevel,
                category: v.category,
                sourceId: v.sourceId,
              })),
            ]);
          }}
        />
      )}
    </div>
  );
}
