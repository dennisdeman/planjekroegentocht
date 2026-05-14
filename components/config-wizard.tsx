"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ConfigV2, PlanSummaryLine, ScheduleMode, Alternative } from "@core";
import { buildConfig, calculateSchedule, computePlanScore, generateBestPlan, generatePlanSummary, hasAlgebraicK, totalRepeatPenalty, proposeAlternatives, getSpelNames } from "@core";
import { VenueSearchModal } from "@ui/venue-search-modal";
import { ManualLocationModal } from "@ui/manual-location-modal";

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
const TOTAL_STEPS = 8;

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
  // Step 2 - Modus + Pools
  const [mode, setMode] = useState<"solo" | "vs">("solo");
  const [usePools, setUsePools] = useState(false);
  const [poolNames, setPoolNames] = useState(["Route A", "Route B"]);
  // Step 3
  const [groupCount, setGroupCount] = useState(6);
  const [groupsPerPool, setGroupsPerPool] = useState<number[]>([3, 3]);
  // Step 4 (movement — only with pools)
  const [movementPolicy, setMovementPolicy] = useState<"free" | "blocks">("free");
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
  // Step 7 (stations — auto-generated)
  const [stationLayout, setStationLayout] = useState<"same" | "split">("split");
  const [stationOverrides, setStationOverrides] = useState<Array<{ spel: string; location: string; capacity: number }> | null>(null);
  // Step 8 (schedule + rules)
  const [startTime, setStartTime] = useState("19:30");
  const [roundDuration, setRoundDuration] = useState(30);
  const [transitionTime, setTransitionTime] = useState(10);
  const [repeatPolicy, setRepeatPolicy] = useState<"off" | "soft" | "hard">("soft");
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

  // ── Auto-fill locaties bij pools + blocks ────────────────────────

  useEffect(() => {
    if (usePools && movementPolicy === "blocks" && locations.length < poolNames.length) {
      const next = [...locations];
      while (next.length < poolNames.length) {
        next.push({ name: `Kroeg ${next.length + 1}` });
      }
      setLocations(next);
    }
  }, [usePools, poolNames.length, movementPolicy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────

  const poolCount = usePools ? poolNames.length : 1;
  const effectiveMovement = usePools ? movementPolicy : "free";
  const actualPoolSizes = usePools ? groupsPerPool : undefined;
  const calc = useMemo(
    () => calculateSchedule(groupCount, poolCount, spellen.length, effectiveMovement, locations.length, scheduleMode, stationLayout, actualPoolSizes),
    [groupCount, poolCount, spellen.length, effectiveMovement, locations.length, scheduleMode, stationLayout, actualPoolSizes]
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
    const result: Array<{ spel: string; location: string; capacity: number }> = [];

    const locNames = locations.map((l) => l.name);
    if (effectiveMovement === "blocks" && usePools && locNames.length >= 2) {
      if (stationLayout === "same") {
        // Each location gets the same set of all spellen
        for (const loc of locNames) {
          for (const spel of spellen) {
            result.push({ spel, location: loc, capacity: 2 });
          }
        }
      } else {
        // Split: groepeer spellen per locatie (1-5 → veld 1, 6-10 → veld 2)
        const perLoc = Math.ceil(spellen.length / locNames.length);
        for (let i = 0; i < spellen.length; i++) {
          result.push({
            spel: spellen[i],
            location: locNames[Math.floor(i / perLoc)] ?? locNames[locNames.length - 1],
            capacity: 2,
          });
        }
      }
    } else {
      // Free / no pools: groepeer spellen per locatie
      const perLoc = Math.ceil(spellen.length / Math.max(locNames.length, 1));
      for (let i = 0; i < spellen.length; i++) {
        result.push({
          spel: spellen[i],
          location: locNames[Math.floor(i / perLoc)] ?? locNames[locNames.length - 1],
          capacity: 2,
        });
      }
    }
    return result;
  }, [spellen, locations, effectiveMovement, usePools, stationLayout]);

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

  function goNext() {
    let next = step + 1;
    // Skip step 4 (movement) if no pools
    if (next === 4 && !usePools) next = 5;
    // Reset station overrides when entering step 7
    if (next === 7) setStationOverrides(null);
    setStep(Math.min(next, TOTAL_STEPS + 1));
  }
  function goBack() {
    let prev = step - 1;
    if (prev === 4 && !usePools) prev = 3;
    setStep(Math.max(prev, 1));
  }

  // Can we proceed?
  function canGoNext(): boolean {
    if (step === 5 && locations.length === 0) return false;
    if (step === 6 && spellen.filter(Boolean).length < locations.length) return false;
    return true;
  }

  // ── Build config ──────────────────────────────────────────────────

  function wizardBuildConfig(): ConfigV2 {
    const config = buildConfig({
      name,
      usePools,
      poolNames,
      groupCount,
      groupsPerPool: usePools ? groupsPerPool : undefined,
      spellen,
      locations,
      movementPolicy,
      stationLayout,
      scheduleMode,
      mode,
      startTime,
      roundDurationMinutes: roundDuration,
      transitionMinutes: transitionTime,
      repeatPolicy,
      stationOverrides: stationOverrides ?? undefined,
      pauseActivityName: calc.hasBye && pauseActivityName ? pauseActivityName : undefined,
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
                    {poolNames.length > 2 && <button type="button" className="btn-sm danger-button" onClick={() => {
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

        {/* Step 4: Movement policy (only with pools) — voor kroegentocht is "vrij" standaard de juiste keuze. */}
        {step === 4 && usePools && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Verplaatsbeleid</h3>
            <p className="muted" style={{ margin: 0 }}>
              Bij een kroegentocht lopen groepen elke ronde naar een nieuwe kroeg, dus &apos;Vrij&apos; is standaard de juiste keuze.
              &apos;Blokken&apos; is een legacy-optie uit de sportdag-context.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <button type="button" className={movementPolicy === "free" ? "start-mode-option is-active" : "start-mode-option"} onClick={() => setMovementPolicy("free")} style={{ textAlign: "left" }}>
                Vrij (aanbevolen)
                <small>Alle groepen verspreiden zich elke ronde over alle kroegen. Standaard voor kroegentochten.</small>
              </button>
              <button type="button" className={movementPolicy === "blocks" ? "start-mode-option is-active" : "start-mode-option"} onClick={() => setMovementPolicy("blocks")} style={{ textAlign: "left" }}>
                Blokken (legacy)
                <small>Elke pool speelt in een vast blok op één locatie. Niet zinvol voor een tocht door een stad.</small>
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Kroegen (was step 6 — komt nu vóór de spellen-toewijzing). */}
        {step === 5 && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Welke kroegen worden bezocht?</h3>
            <p className="muted" style={{ margin: 0 }}>
              Elke kroeg krijgt straks 1 spel toegewezen. Gebruik <strong>Zoek kroegen</strong> om
              kroegen via Google te zoeken, of voeg handmatig namen toe.
              {mode === "solo"
                ? ` Bij Solo-modus heb je minimaal ${groupCount} kroegen nodig (1 per groep per ronde).`
                : ` Bij Vs-modus heb je minimaal ${Math.ceil(groupCount / 2)} kroegen nodig (2 groepen per kroeg).`}
              {usePools && movementPolicy === "blocks" ? ` Bij blokken heb je minimaal ${poolCount} locaties nodig (1 per pool).` : ""}
            </p>
            <div>
              {locations.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 4, alignItems: "center" }}>
                  <div>
                    <input
                      value={l.name}
                      onChange={(e) => { const next = [...locations]; next[i] = { ...next[i], name: e.target.value }; setLocations(next); }}
                      style={{ width: "100%" }}
                    />
                    {(l.address || l.rating != null) && (
                      <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                        {l.address ?? ""}{l.rating != null ? ` · ${l.rating.toFixed(1)}⭐${l.reviewCount ? ` (${l.reviewCount})` : ""}` : ""}
                      </div>
                    )}
                  </div>
                  {locations.length > 1 && <button type="button" className="btn-sm danger-button" onClick={() => setLocations(locations.filter((_, j) => j !== i))}>X</button>}
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button type="button" className="btn-sm" onClick={() => setShowManualLocation(true)}>+ Kroeg toevoegen</button>
                <button type="button" className="btn-sm btn-ghost" onClick={() => setShowVenueSearch(true)}>🔍 Zoek meerdere kroegen tegelijk</button>
              </div>
            </div>
            {usePools && movementPolicy === "blocks" && locations.length < poolCount && (
              <div className="notice notice-warning" style={{ marginTop: 8 }}>
                <p style={{ margin: 0 }}>Bij blokken heb je minimaal {poolCount} locaties nodig. Voeg nog {poolCount - locations.length} locatie{poolCount - locations.length > 1 ? "s" : ""} toe.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Spel per kroeg (was step 5 — paradigm change: 1-op-1 mapping). */}
        {step === 6 && (
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

        {/* Step 7: Je kroegentocht */}
        {step === 7 && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Je kroegentocht</h3>

            {effectiveMovement === "blocks" && usePools && locations.length >= 2 && (
              <>
                <p className="muted" style={{ margin: 0 }}>Hoe wil je de spellen verdelen over de velden?</p>
                <div style={{ display: "grid", gap: 8 }}>
                  <button
                    type="button"
                    className={stationLayout === "split" ? "start-mode-option is-active" : "start-mode-option"}
                    onClick={() => { setStationLayout("split"); setStationOverrides(null); }}
                    style={{ textAlign: "left" }}
                  >
                    Verschillende spellen per veld
                    <small>Spellen worden verdeeld over de velden. Meer variatie, elk veld heeft eigen activiteiten.</small>
                  </button>
                  <button
                    type="button"
                    className={stationLayout === "same" ? "start-mode-option is-active" : "start-mode-option"}
                    onClick={() => { setStationLayout("same"); setStationOverrides(null); }}
                    style={{ textAlign: "left" }}
                  >
                    Dezelfde spellen op elk veld
                    <small>Elk veld krijgt alle spellen. Pools spelen dezelfde spellen, maar op hun eigen veld.</small>
                  </button>
                </div>
              </>
            )}

            {/* Waarschuwing bij onhaalbare speldekking in all-spellen modus */}
            {scheduleMode === "all-spellen" && usePools && movementPolicy === "blocks" && (() => {
              const perPool = Math.ceil(groupCount / poolNames.length);
              const H = Math.floor(perPool / 2);
              const algebraicOk = perPool % 2 === 0 && hasAlgebraicK(H);
              if (algebraicOk) return null;
              return (
                <div className="notice notice-warning" style={{ marginTop: 8 }}>
                  <p style={{ margin: 0, fontSize: "0.85rem" }}>
                    Met {perPool} groepen per pool is het niet gegarandeerd dat <strong>alle</strong> groepen alle {spellen.length} spellen spelen.
                    Een deel van de groepen zal mogelijk 1 of meer spellen missen.
                    {alternatives.length > 0
                      ? "Bekijk de aanbevolen configuraties hieronder voor alternatieven met volledige dekking."
                      : "Klik op \"Optimaliseer mijn kroegentocht\" om aanbevolen configuraties met volledige dekking te bekijken."}
                  </p>
                </div>
              );
            })()}

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

            {/* Perfect: geen optimalisatie nodig */}
            {!feasibility.loading && feasibility.repeats === 0 && feasibility.totalScore >= 10 && feasibility.summary.every((l) => l.severity !== "warn") && (
              <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(34,139,34,0.06)", borderRadius: 6, border: "1px solid rgba(34,139,34,0.2)" }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                  &#x2705; Perfecte configuratie! Geen aanpassingen nodig.
                </p>
              </div>
            )}

            {/* Niet perfect: toon optimaliseer knop */}
            {!feasibility.loading && feasibility.repeats >= 0 && !(feasibility.repeats === 0 && feasibility.totalScore >= 10 && feasibility.summary.every((l) => l.severity !== "warn")) && alternatives.length === 0 && !alternativesLoading && (
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
                  We zoeken een betere configuratie door groepen, spellen en layout te variëren.
                </p>
              </div>
            )}

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
                        {alt.spelCoverage.full === alt.spelCoverage.total
                          ? `Alle ${alt.spelCoverage.total} groepen spelen alle spellen`
                          : `${alt.spelCoverage.full}/${alt.spelCoverage.total} groepen spelen alle spellen`}
                        {" \u00B7 "}{alt.achievedRepeats} herhaling{alt.achievedRepeats !== 1 ? "en" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn-primary btn-sm" onClick={() => {
                        if (alt.apply.groupCount != null) updateGroupCount(alt.apply.groupCount);
                        if (alt.apply.spellen) setSpellen(alt.apply.spellen);
                        if (alt.apply.stationLayout) { setStationLayout(alt.apply.stationLayout); setStationOverrides(null); }
                        if (alt.apply.scheduleMode) setScheduleMode(alt.apply.scheduleMode);
                        if (alt.apply.movementPolicy) setMovementPolicy(alt.apply.movementPolicy);
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

            <p className="muted" style={{ margin: 0 }}>
              Er worden <strong>{activeStations.length} stations</strong> aangemaakt.
              Je kunt spellen verplaatsen naar een ander veld.
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
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Step 8: Schedule + Rules */}
        {step === 8 && (
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
            <InfoBox>
              <p style={{ margin: "0 0 4px" }}><strong>Programma:</strong></p>
              {schedulePreview.slots.map((s, i) => (
                <p key={i} style={{ margin: "2px 0", fontSize: "0.82rem" }}>
                  {s.kind === "Pauze" ? "\u2615" : "\u26BD"} {s.label} — {s.kind}
                </p>
              ))}
              <p style={{ margin: "6px 0 0", fontWeight: 600, fontSize: "0.85rem" }}>Einde: {schedulePreview.endTime}</p>
            </InfoBox>

            <h3 style={{ margin: "12px 0 0" }}>Regels</h3>
            <InfoBox>
              <p style={{ margin: 0 }}>
                {calc.matchupMaxNeeded === 1
                  ? "Elke groep speelt maximaal 1x tegen dezelfde tegenstander."
                  : `Met ${calc.roundsNeeded} rondes en ${calc.roundRobinRounds} unieke tegenstanders spelen sommige groepen ${calc.matchupMaxNeeded}x tegen dezelfde tegenstander.`}
              </p>
            </InfoBox>
            <label>
              Herhaling van hetzelfde spel
              <select value={repeatPolicy} onChange={(e) => setRepeatPolicy(e.target.value as "off" | "soft" | "hard")}>
                <option value="off">Toestaan</option>
                <option value="soft">Liever niet (waarschuwing)</option>
                <option value="hard">Verbieden</option>
              </select>
              <small className="muted">
                {repeatPolicy === "off" && "Groepen mogen hetzelfde spel vaker doen."}
                {repeatPolicy === "soft" && "De planner probeert herhalingen te vermijden, maar blokkeert niet."}
                {repeatPolicy === "hard" && "De planner weigert als een groep hetzelfde spel twee keer doet."}
              </small>
            </label>
          </div>
        )}

        {/* Summary */}
        {isSummary && (
          <div className="form-grid">
            <h3 style={{ margin: 0 }}>Alles klaar!</h3>
            <p className="muted" style={{ margin: 0 }}>Controleer je keuzes.</p>
            <div style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
              <div><strong>Naam:</strong> {name || "Nieuwe kroegentocht"}</div>
              <div><strong>Pools:</strong> {usePools ? poolNames.join(", ") : "Nee"}</div>
              <div><strong>Groepen:</strong> {groupCount}{usePools ? ` (${groupsPerPool.join(" + ")} per pool)` : ""}</div>
              {usePools && <div><strong>Verplaatsbeleid:</strong> {movementPolicy === "blocks" ? "Blokken" : "Vrij"}</div>}
              <div><strong>Spellen:</strong> {spellen.join(", ")}</div>
              <div><strong>Locaties:</strong> {locations.join(", ")}</div>
              <div><strong>Stations:</strong> {activeStations.length}</div>
              <div><strong>Rondes:</strong> {calc.roundsNeeded} ({roundDuration} min, {transitionTime} min wissel){calc.breakAfterSlot > 0 ? `, pauze na ronde ${calc.breakAfterSlot}` : ""}</div>
              <div><strong>Tijden:</strong> {schedulePreview.slots[0]?.label.split(" - ")[0]} tot {schedulePreview.endTime}</div>
              {pauseActivityName && <div><strong>Pauze-activiteit:</strong> {pauseActivityName}</div>}
              <div><strong>Tegenstander max:</strong> {calc.matchupMaxNeeded}x</div>
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
