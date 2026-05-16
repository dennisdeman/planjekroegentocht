/**
 * `proposeAlternatives` — de uniforme kern voor wizard én planner.
 *
 * Genereert een lijst configuratie-alternatieven die elk **echt** worden
 * gebouwd, gepland en gescoord via `generateBestPlan`. Geen heuristieken,
 * geen voorspellingen — alleen bewezen resultaten.
 *
 * Vervangt `findNearestPerfect` (wizard) en `generateDeterministicCandidates`
 * (advisor). Eén bron, één sorteer-criterium, dezelfde resultaten overal.
 *
 * Zie `docs/generator-design.md` §2.4.
 */

import type { ConfigV2, Id, ScheduleMode } from "./model";
import type { FeasibilityReport } from "./feasibility";
import type { PlanScoreBreakdown } from "./scoring";
import { analyzePlanFeasibility, hasAlgebraicK } from "./feasibility";
import { buildConfig, calculateSchedule } from "./config-builder";
import type { ConfigBuilderParams } from "./config-builder";
import { computePlanScore } from "./scoring";
import { generateBestPlan } from "./generator";
import type { PlanV2 } from "./model";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AlternativePatch {
  groupCount?: number;
  groupsPerPool?: number[];
  spellen?: string[];
  stationLayout?: "same" | "split";
  scheduleMode?: ScheduleMode;
  movementPolicy?: "free" | "blocks";
  addTimeslots?: number;
  addPauseActivity?: string;
  locations?: string[];
}

export interface Alternative {
  id: string;
  label: string;
  reason: string;
  apply: AlternativePatch;
  mathMinimum: number;
  achievedScore: PlanScoreBreakdown;
  achievedRepeats: number;
  /** Aantal groepen dat alle spellen speelt / totaal aantal groepen */
  spelCoverage: { full: number; total: number };
  costToUser: number;
  source: "deterministic" | "llm";
}

export interface ProposeAlternativesOptions {
  maxAlternatives?: number;
  costBudget?: number;
  seedAlternatives?: AlternativePatch[];
}

// ---------------------------------------------------------------------------
// Kosten per dimensie
// ---------------------------------------------------------------------------

const COST_SPEL = 1;
const COST_GROUP = 1;
const COST_LAYOUT = 3;
const COST_LOCATION = 3;
const COST_SCHEDULE = 1;
const COST_MOVEMENT = 4;
const COST_TIMESLOT = 1;
const COST_PAUSE = 1;

// ---------------------------------------------------------------------------
// Internal: config → builder params extractie
// ---------------------------------------------------------------------------

function extractBuilderParams(config: ConfigV2): ConfigBuilderParams {
  const poolCount = config.segmentsEnabled ? config.segments.length : 1;
  const spellen = config.activityTypes
    .filter((a) => a.id !== "activity-pause")
    .map((a) => a.name);
  const locations = config.locations.map((l) => l.name);

  // Detect layout from station distribution
  const stationsPerLoc = new Map<Id, number>();
  for (const s of config.stations) {
    if (s.activityTypeId === "activity-pause") continue;
    stationsPerLoc.set(s.locationId, (stationsPerLoc.get(s.locationId) ?? 0) + 1);
  }
  const activityIdsPerLoc = new Map<Id, Set<Id>>();
  for (const s of config.stations) {
    if (s.activityTypeId === "activity-pause") continue;
    const set = activityIdsPerLoc.get(s.locationId) ?? new Set();
    set.add(s.activityTypeId);
    activityIdsPerLoc.set(s.locationId, set);
  }
  // If all locations have the same activity types, it's "same" layout
  const locSets = [...activityIdsPerLoc.values()];
  const isSame =
    locSets.length >= 2 &&
    locSets.every(
      (s) =>
        s.size === locSets[0].size &&
        [...s].every((id) => locSets[0].has(id))
    );
  const stationLayout: "same" | "split" = isSame ? "same" : "split";

  // Detect groupsPerPool
  const groupsPerPool: number[] = [];
  if (config.segmentsEnabled) {
    for (const seg of config.segments) {
      groupsPerPool.push(
        config.groups.filter((g) => g.segmentId === seg.id).length
      );
    }
  }

  return {
    name: config.name,
    usePools: config.segmentsEnabled,
    poolNames: config.segments.map((s) => s.name),
    groupCount: config.groups.length,
    groupsPerPool: groupsPerPool.length > 0 ? groupsPerPool : undefined,
    spellen,
    locations,
    movementPolicy: config.movementPolicy,
    stationLayout,
    scheduleMode: config.scheduleSettings.scheduleMode,
    mode: config.scheduleSettings.mode,
    startTime: "09:00",
    roundDurationMinutes: config.scheduleSettings.roundDurationMinutes,
    transitionMinutes: config.scheduleSettings.transitionMinutes,
    repeatPolicy: config.constraints.avoidRepeatActivityType,
    pauseActivityName: config.pauseActivity?.name,
  };
}

// ---------------------------------------------------------------------------
// Solo-mode: aparte enumerator + apply-pad
//
// In Solo geldt: 1 groep per kroeg per slot, 1 spel per kroeg (auto-couple),
// generator gebruikt `solo-rotation` strategy. Vs-dimensies (layout, movement,
// scheduleMode-flip, groupsPerPool, pauze-activiteit) zijn niet relevant.
//
// We bouwen niet via `buildConfig` (Vs-biased: zou N*M stations maken in same
// layout). In plaats daarvan muteren we de bestaande config direct: groepen
// bijmaken/weghalen en timeslots toevoegen/weghalen. Locaties/stations laten
// we ongemoeid — die zijn user-curated.
// ---------------------------------------------------------------------------

function applySoloPatch(config: ConfigV2, patch: AlternativePatch): ConfigV2 {
  // Shallow clone + nieuwe arrays voor geraakte velden
  const cloned: ConfigV2 = {
    ...config,
    groups: config.groups.map((g) => ({ ...g })),
    timeslots: config.timeslots.map((t) => ({ ...t })),
  };

  if (patch.groupCount !== undefined) {
    const target = patch.groupCount;
    if (target < cloned.groups.length) {
      cloned.groups = cloned.groups.slice(0, target);
    } else if (target > cloned.groups.length) {
      const defaultSegmentId = cloned.segmentsEnabled
        ? cloned.segments[0]?.id
        : undefined;
      for (let i = cloned.groups.length; i < target; i++) {
        cloned.groups.push({
          id: `group-extra-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Groep ${i + 1}`,
          ...(defaultSegmentId ? { segmentId: defaultSegmentId } : {}),
        });
      }
    }
  }

  if (patch.addTimeslots !== undefined && patch.addTimeslots !== 0) {
    const active = cloned.timeslots
      .filter((s) => s.kind === "active")
      .sort((a, b) => a.index - b.index);
    if (patch.addTimeslots > 0) {
      const last = active[active.length - 1];
      if (last) {
        for (let i = 0; i < patch.addTimeslots; i++) {
          cloned.timeslots.push({
            id: `slot-extra-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
            start: last.end,
            end: last.end,
            label: `Extra ronde ${active.length + i + 1}`,
            kind: "active",
            index: last.index + i + 1,
          });
        }
      }
    } else {
      // Verwijder de laatste N actieve slots
      const removeCount = Math.min(-patch.addTimeslots, active.length - 1);
      if (removeCount > 0) {
        const removeIds = new Set(
          active.slice(active.length - removeCount).map((s) => s.id)
        );
        cloned.timeslots = cloned.timeslots.filter((s) => !removeIds.has(s.id));
      }
    }
  }

  return cloned;
}

interface SoloMismatch {
  groups: number;
  stations: number;
  activeSlots: number;
}

function inspectSoloMismatch(config: ConfigV2): SoloMismatch {
  const groups = config.groups.length;
  const stations = config.stations.filter(
    (s) => s.activityTypeId !== "activity-pause"
  ).length;
  const activeSlots = config.timeslots.filter((t) => t.kind === "active").length;
  return { groups, stations, activeSlots };
}

function enumerateSoloCandidates(config: ConfigV2): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  const { groups, stations, activeSlots } = inspectSoloMismatch(config);

  // 1. Groepen aanpassen zodat aantal groepen <= aantal kroegen
  //    (dan speelt elke groep elke ronde, geen byes)
  if (groups > stations && stations > 0) {
    const remove = groups - stations;
    candidates.push({
      patch: { groupCount: stations },
      cost: remove,
      label: `${stations} groepen (${remove} minder)`,
      reason: `Met ${stations} groepen passen alle groepen elke ronde in een kroeg — geen groep meer op bye.`,
    });
  }
  // 2. Minder groepen (-1, -2) — voor wie wil snijden zonder helemaal naar match
  if (groups > 2) {
    for (const delta of [1, 2]) {
      const target = groups - delta;
      if (target < 1) continue;
      if (target === stations) continue; // dubbele
      candidates.push({
        patch: { groupCount: target },
        cost: delta,
        label: `${target} groepen (${delta} minder)`,
        reason: target <= stations
          ? `Met ${target} groepen passen alle groepen elke ronde in een kroeg.`
          : `Iets minder groepen — minder ${target - stations} groep${target - stations > 1 ? "en" : ""} op bye per ronde.`,
      });
    }
  }
  // 3. Meer groepen (+1, +2) — alleen suggereren als er al meer dan 1 groep is.
  //    Een 1-groep-tocht (vrijgezellen, etc.) heeft expliciet 1 groep gekozen;
  //    "meer groepen toevoegen" is daar onzinnig advies.
  if (groups > 1) {
    for (const delta of [1, 2]) {
      const target = groups + delta;
      candidates.push({
        patch: { groupCount: target },
        cost: delta,
        label: `${target} groepen (${delta} meer)`,
        reason:
          target <= stations
            ? `Meer groepen die mee kunnen — passen nog allemaal in de ${stations} kroegen.`
            : `Meer groepen, maar ${target - stations} groep${target - stations > 1 ? "en" : ""} per ronde op bye (wisselend).`,
      });
    }
  }

  // 4. Slots = stations (elke kroeg precies 1× bezocht)
  if (activeSlots !== stations && stations > 0) {
    const delta = stations - activeSlots;
    candidates.push({
      patch: { addTimeslots: delta },
      cost: Math.abs(delta),
      label: `${stations} rondes (${delta > 0 ? "+" : ""}${delta})`,
      reason:
        delta > 0
          ? `Met ${stations} rondes bezoekt elke groep álle kroegen exact 1×.`
          : `Met ${stations} rondes bezoekt elke groep álle kroegen exact 1× zonder herhalingen.`,
    });
  }
  // 5. Extra rondes (+1, +2) — alleen als zinvol (groepen herbezoeken kroegen)
  if (stations > 0) {
    for (const extra of [1, 2]) {
      const target = activeSlots + extra;
      if (target === stations) continue; // dekt al door bovenstaande
      candidates.push({
        patch: { addTimeslots: extra },
        cost: extra,
        label: `${target} rondes (+${extra})`,
        reason: `Extra ronde${extra > 1 ? "s" : ""} — langere kroegentocht. ${target > stations ? "Sommige kroegen worden herbezocht." : "Niet alle kroegen worden bezocht."}`,
      });
    }
  }
  // 6. Minder rondes (-1, -2)
  for (const extra of [1, 2]) {
    const target = activeSlots - extra;
    if (target < 1) continue;
    candidates.push({
      patch: { addTimeslots: -extra },
      cost: extra,
      label: `${target} rondes (-${extra})`,
      reason: `Kortere kroegentocht — ${target} rondes.${target < stations ? ` ${stations - target} kroeg${stations - target > 1 ? "en" : ""} wordt niet bezocht.` : ""}`,
    });
  }

  // 7. Combinaties: groepen + slots
  const groupOnly = candidates.filter((c) => "groupCount" in c.patch);
  const slotOnly = candidates.filter((c) => "addTimeslots" in c.patch);
  for (const g of groupOnly) {
    for (const s of slotOnly) {
      if (g.cost + s.cost > 4) continue;
      candidates.push({
        patch: { ...g.patch, ...s.patch },
        cost: g.cost + s.cost,
        label: `${g.label} + ${s.label}`,
        reason: `${g.reason} ${s.reason}`,
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Internal: kandidaat-generatie
// ---------------------------------------------------------------------------

interface RawCandidate {
  patch: AlternativePatch;
  cost: number;
  label: string;
  reason: string;
}

function enumerateCandidates(
  config: ConfigV2,
  baseParams: ConfigBuilderParams,
  feasibility: FeasibilityReport,
  costBudget: number
): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  const poolCount = baseParams.usePools ? baseParams.poolNames.length : 1;
  const currentGroupCount = baseParams.groupCount;
  const currentSpelCount = baseParams.spellen.length;
  const currentLayout = baseParams.stationLayout;
  const currentMode = baseParams.scheduleMode;
  const currentMovement = baseParams.movementPolicy;
  const currentLocCount = baseParams.locations.length;

  // --- 1. Groepen: richting "nice H" waarden ---
  for (let delta = -6; delta <= 6; delta++) {
    if (delta === 0) continue;
    const newCount = currentGroupCount + delta;
    if (newCount < poolCount * 2) continue;
    const cost = Math.abs(delta) * COST_GROUP;
    if (cost > costBudget) continue;

    // Bereken werkelijke pool-verdeling: grotere pools krijgen 1 extra
    const basePerPool = Math.floor(newCount / poolCount);
    const remainder = newCount % poolCount;
    const poolSizes = Array.from({ length: poolCount }, (_, i) =>
      basePerPool + (i < remainder ? 1 : 0)
    );
    const poolLabel = poolCount > 1
      ? poolSizes.every((s) => s === poolSizes[0])
        ? `${poolSizes[0]}/pool`
        : poolSizes.join("+")
      : "";
    const largestPool = Math.max(...poolSizes);
    const H = Math.floor(largestPool / 2);
    const algebraicNote = hasAlgebraicK(H) && largestPool % 2 === 0
      ? " (0 herhalingen wiskundig haalbaar)"
      : "";

    candidates.push({
      patch: { groupCount: newCount },
      cost,
      label: poolLabel ? `${newCount} groepen (${poolLabel})` : `${newCount} groepen`,
      reason: `${delta > 0 ? "Meer" : "Minder"} groepen${algebraicNote}`,
    });
  }

  // --- 2. Spellen: ±5 ---
  for (let delta = -5; delta <= 5; delta++) {
    if (delta === 0) continue;
    const newCount = currentSpelCount + delta;
    if (newCount < 1) continue;
    const cost = Math.abs(delta) * COST_SPEL;
    if (cost > costBudget) continue;

    candidates.push({
      patch: {
        spellen:
          delta > 0
            ? [
                ...baseParams.spellen,
                ...Array.from({ length: delta }, (_, i) => `Extra spel ${i + 1}`),
              ]
            : baseParams.spellen.slice(0, newCount),
      },
      cost,
      label: `${newCount} spellen`,
      reason: delta > 0 ? "Meer variatie, betere bezetting" : "Minder stations nodig",
    });
  }

  // --- 3. Layout flip ---
  if (
    baseParams.usePools &&
    currentMovement === "blocks" &&
    currentLocCount >= 2
  ) {
    const altLayout: "same" | "split" =
      currentLayout === "split" ? "same" : "split";
    if (COST_LAYOUT <= costBudget) {
      candidates.push({
        patch: { stationLayout: altLayout },
        cost: COST_LAYOUT,
        label: `${altLayout} layout`,
        reason:
          altLayout === "same"
            ? "Alle locaties dezelfde spellen — meer kans op 0 herhalingen"
            : "Elke locatie unieke spellen — meer variatie",
      });
    }
  }

  // --- 4. Movement flip ---
  if (
    baseParams.usePools &&
    currentLocCount >= 2 &&
    COST_MOVEMENT <= costBudget
  ) {
    const altMovement: "free" | "blocks" =
      currentMovement === "blocks" ? "free" : "blocks";
    candidates.push({
      patch: { movementPolicy: altMovement },
      cost: COST_MOVEMENT,
      label: altMovement === "free" ? "Vrije verplaatsing" : "Blokken",
      reason:
        altMovement === "free"
          ? "Groepen mogen naar alle locaties — meer flexibiliteit"
          : "Groepen wisselen per blok — meer structuur",
    });
  }

  // --- 5. Schedule mode flip ---
  {
    const altMode: ScheduleMode =
      currentMode === "all-spellen" ? "round-robin" : "all-spellen";
    if (COST_SCHEDULE <= costBudget) {
      candidates.push({
        patch: { scheduleMode: altMode },
        cost: COST_SCHEDULE,
        label: altMode === "all-spellen" ? "Alle spellen modus" : "Elke tegenstander 1× modus",
        reason:
          altMode === "all-spellen"
            ? "Elke groep speelt elke spel"
            : "Elk paar groepen speelt exact één keer tegen elkaar",
      });
    }
  }

  // --- 6a. Extra rondes met pauze-activiteit (Pad B bye-assisted) ---
  for (const extraRounds of [1, 2]) {
    const cost = extraRounds * COST_TIMESLOT + COST_PAUSE;
    if (cost > costBudget) continue;

    candidates.push({
      patch: {
        addTimeslots: extraRounds,
        addPauseActivity: config.pauseActivity?.name ?? "Pauze-activiteit",
      },
      cost,
      label: `+${extraRounds} ronde${extraRounds > 1 ? "s" : ""} met pauze-activiteit`,
      reason:
        "Extra ronde(s) met rust geven de generator meer ruimte om herhalingen te vermijden",
    });
  }

  // --- 6b. Extra speelrondes voor spel-dekking (all-spellen modus) ---
  // In all-spellen modus is de belofte: elke groep speelt elke spel.
  // Als het huidige schema niet genoeg rondes heeft om dat waar te maken,
  // bied dan extra rondes aan waar alle groepen gewoon spelen (geen pauze).
  // Trade-off: meer tegenstander-herhalingen, maar dat is acceptabel
  // in all-spellen modus (de gebruiker heeft dat al geaccepteerd).
  if (currentMode === "all-spellen") {
    for (const extraRounds of [1, 2, 3]) {
      const cost = extraRounds * COST_TIMESLOT;
      if (cost > costBudget) continue;

      candidates.push({
        patch: { addTimeslots: extraRounds },
        cost,
        label: `+${extraRounds} speelronde${extraRounds > 1 ? "s" : ""}`,
        reason:
          "Extra speelronde(s) geven meer groepen de kans om meer spellen te spelen. " +
          "Verbetert de speldekking, maar garandeert geen 100%. Meer tegenstander-herhalingen.",
      });
    }
  }

  // --- 7. Pauze-activiteit toevoegen (zonder extra rondes) ---
  if (!config.pauseActivity) {
    const hasBye = feasibility.segments.some(
      (s) => s.groupCount % 2 === 1
    );
    if (hasBye && COST_PAUSE <= costBudget) {
      candidates.push({
        patch: { addPauseActivity: "Pauze-activiteit" },
        cost: COST_PAUSE,
        label: "Pauze-activiteit toevoegen",
        reason: "Rustgroepen krijgen een activiteit in plaats van niets te doen",
      });
    }
  }

  // --- 8. Extra locatie ---
  if (currentLocCount < 4 && COST_LOCATION <= costBudget) {
    const existingNames = baseParams.locations.map((l) => (typeof l === "string" ? l : l.name));
    candidates.push({
      patch: {
        locations: [
          ...existingNames,
          `Kroeg ${currentLocCount + 1}`,
        ],
      },
      cost: COST_LOCATION,
      label: `${currentLocCount + 1} locaties`,
      reason: "Meer stations beschikbaar — betere spreiding",
    });
  }

  // --- 9. 2-dimensionale combinaties ---
  // Alleen combinaties met totale cost <= budget en patches op
  // verschillende dimensies. Beperk tot de eerste 20 singles per
  // dimensie om combinatie-explosie te voorkomen (bij 20 singles
  // zijn er max 190 combinaties i.p.v. 435+).
  const singles = [...candidates];
  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length; j++) {
      const a = singles[i];
      const b = singles[j];
      const aKeys = Object.keys(a.patch);
      const bKeys = Object.keys(b.patch);
      if (aKeys.some((k) => bKeys.includes(k))) continue;

      const comboCost = a.cost + b.cost;
      if (comboCost > costBudget) continue;

      candidates.push({
        patch: { ...a.patch, ...b.patch },
        cost: comboCost,
        label: `${a.label} + ${b.label}`,
        reason: `${a.reason}. ${b.reason}`,
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Internal: patch toepassen op config
// ---------------------------------------------------------------------------

/**
 * Past een `AlternativePatch` toe op een bestaande `ConfigV2` of op
 * expliciete `ConfigBuilderParams`. Retourneert een nieuwe config.
 */
export function applyPatchToConfig(
  base: ConfigV2 | ConfigBuilderParams,
  patch: AlternativePatch
): ConfigV2 {
  // Solo-tak: mutating apply, geen buildConfig (Vs-biased voor stations).
  if ("id" in base && (base as ConfigV2).scheduleSettings.mode === "solo") {
    return applySoloPatch(base as ConfigV2, patch);
  }

  const baseParams = "id" in base ? extractBuilderParams(base as ConfigV2) : base;
  const params = { ...baseParams };

  if (patch.groupCount !== undefined) {
    params.groupCount = patch.groupCount;
    // Wis groupsPerPool als het groepenaantal wijzigt maar de per-pool
    // verdeling niet expliciet is meegegeven — anders probeert buildConfig
    // de oude verdeling te gebruiken die niet meer past.
    if (patch.groupsPerPool === undefined) params.groupsPerPool = undefined;
  }
  if (patch.groupsPerPool !== undefined) params.groupsPerPool = patch.groupsPerPool;
  if (patch.spellen !== undefined) params.spellen = patch.spellen;
  if (patch.stationLayout !== undefined) params.stationLayout = patch.stationLayout;
  if (patch.scheduleMode !== undefined) params.scheduleMode = patch.scheduleMode;
  if (patch.movementPolicy !== undefined) params.movementPolicy = patch.movementPolicy;
  if (patch.locations !== undefined) params.locations = patch.locations;
  if (patch.addPauseActivity !== undefined) params.pauseActivityName = patch.addPauseActivity;

  const { config } = buildConfig(params);

  // Extra timeslots: voeg actieve slots toe aan het einde van het laatste blok
  if (patch.addTimeslots && patch.addTimeslots > 0) {
    const activeSlots = config.timeslots
      .filter((s) => s.kind === "active")
      .sort((a, b) => a.index - b.index);
    const lastActive = activeSlots[activeSlots.length - 1];
    if (lastActive) {
      for (let i = 0; i < patch.addTimeslots; i++) {
        const newId = `slot-extra-${i + 1}`;
        config.timeslots.push({
          id: newId,
          start: lastActive.end,
          end: lastActive.end,
          label: `Extra ronde ${i + 1}`,
          kind: "active",
          index: lastActive.index + i + 1,
        });
        // Wijs toe aan het laatste blok
        if (config.locationBlocks && config.locationBlocks.length > 0) {
          config.locationBlocks[config.locationBlocks.length - 1].timeslotIds.push(newId);
        }
      }
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Spel coverage helper
// ---------------------------------------------------------------------------

function computeSpelCoverage(
  plan: PlanV2,
  config: ConfigV2
): { full: number; total: number } {
  const stationById = new Map(config.stations.map((s) => [s.id, s]));
  const totalSpellen = config.activityTypes.filter(
    (a) => a.id !== "activity-pause"
  ).length;
  if (totalSpellen === 0) return { full: 0, total: 0 };

  const groupActivities = new Map<Id, Set<Id>>();
  for (const alloc of plan.allocations) {
    const station = stationById.get(alloc.stationId);
    if (!station || station.activityTypeId === "activity-pause") continue;
    for (const gid of alloc.groupIds) {
      let set = groupActivities.get(gid);
      if (!set) {
        set = new Set();
        groupActivities.set(gid, set);
      }
      set.add(station.activityTypeId);
    }
  }

  const total = groupActivities.size;
  const full = [...groupActivities.values()].filter(
    (s) => s.size >= totalSpellen
  ).length;
  return { full, total };
}

// ---------------------------------------------------------------------------
// Yield helper — geeft de event loop vrij zodat de browser responsive
// blijft tijdens het evalueren van tientallen kandidaten.
// ---------------------------------------------------------------------------

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function proposeAlternatives(
  config: ConfigV2,
  currentPlan?: PlanV2,
  options?: ProposeAlternativesOptions
): Promise<Alternative[]> {
  const maxAlternatives = options?.maxAlternatives ?? 5;
  const costBudget = options?.costBudget ?? 7;

  const baseFeasibility = analyzePlanFeasibility(config);
  const baseParams = extractBuilderParams(config);

  // Yield vóór de baseline-berekening (CPU-intensief)
  await yieldToEventLoop();

  // Baseline score: gebruik het huidige plan als dat er is, anders genereer
  let baseScore: PlanScoreBreakdown;
  let baseRepeats: number;
  let basePlan: PlanV2;
  if (currentPlan) {
    baseScore = computePlanScore(currentPlan, config, baseFeasibility);
    baseRepeats = baseScore.repeatCount;
    basePlan = currentPlan;
  } else {
    const baseResult = generateBestPlan(config, { fastStrategiesOnly: true, optimizer: { maxIterations: 50, restarts: 1 } });
    baseScore = baseResult.achievedScore;
    baseRepeats = baseScore.repeatCount;
    basePlan = baseResult.plan;
  }
  const baseCoverage = computeSpelCoverage(basePlan, config);

  // Genereer kandidaten — Solo en Vs hebben aparte dimensies
  const isSolo = config.scheduleSettings.mode === "solo";

  // "Al optimaal"-shortcut. In Vs gelden de strenge eisen (score >= 10);
  // in Solo is `stationOccupancy` mathematisch begrensd door (groups/stations)
  // en dus geen bruikbare metric. Voor Solo geldt al-optimaal als:
  //   - geen herhalingen
  //   - volledige dekking
  //   - geen mismatch tussen groepen / kroegen / slots die de gebruiker zou willen oplossen
  if (isSolo) {
    const stationCount = config.stations.filter(
      (s) => s.activityTypeId !== "activity-pause"
    ).length;
    const activeSlots = config.timeslots.filter((t) => t.kind === "active").length;
    const groupCount = config.groups.length;
    const noMismatch =
      groupCount > 0 &&
      stationCount > 0 &&
      groupCount <= stationCount &&
      activeSlots === stationCount;
    if (
      baseRepeats === 0 &&
      baseCoverage.full === baseCoverage.total &&
      noMismatch
    ) {
      return [];
    }
  } else if (baseRepeats === 0 && baseScore.totalScore >= 10.0 && baseCoverage.full === baseCoverage.total) {
    return [];
  }
  const rawCandidates = isSolo
    ? enumerateSoloCandidates(config)
    : enumerateCandidates(config, baseParams, baseFeasibility, costBudget);

  // Voeg eventuele seed-alternatieven toe (voor LLM-uitbreiding)
  if (options?.seedAlternatives) {
    for (const seed of options.seedAlternatives) {
      rawCandidates.push({
        patch: seed,
        cost: 5, // conservatieve schatting voor LLM-suggesties
        label: "Combinatie-suggestie",
        reason: "AI-voorgestelde combinatie van wijzigingen",
      });
    }
  }

  // Sorteer: lagere cost eerst.
  rawCandidates.sort((a, b) => a.cost - b.cost);

  const alternatives: Alternative[] = [];
  let altId = 0;
  let evaluated = 0;
  const maxEvaluations = 40;

  for (const candidate of rawCandidates) {
    if (alternatives.length >= maxAlternatives * 3) break;
    if (evaluated >= maxEvaluations) break;

    // Yield elke 3 evaluaties zodat de browser responsive blijft
    if (evaluated > 0 && evaluated % 3 === 0) {
      await yieldToEventLoop();
    }

    evaluated++;
    let patchedConfig: ConfigV2;
    try {
      // Solo gebruikt mutating apply op de echte config (buildConfig is Vs-biased).
      patchedConfig = isSolo
        ? applySoloPatch(config, candidate.patch)
        : applyPatchToConfig(baseParams, candidate.patch);
    } catch {
      continue;
    }

    let result;
    try {
      // Gebruik snelle modus: geen shuffled-rounds permutaties, minder
      // optimizer-iteraties. De gebruiker genereert het gekozen alternatief
      // toch opnieuw met volledige optimalisatie bij "toepassen".
      result = generateBestPlan(patchedConfig, {
        optimizer: { maxIterations: 50, restarts: 1 },
        fastStrategiesOnly: true,
      });
    } catch {
      continue;
    }

    const patchedFeasibility = analyzePlanFeasibility(patchedConfig);
    const achievedRepeats = result.achievedScore.repeatCount;
    const coverage = computeSpelCoverage(result.plan, patchedConfig);

    // Accepteer als de score beter is OF als de herhalingen lager zijn
    // OF als de speldekking beter is
    const betterScore = result.achievedScore.totalScore > baseScore.totalScore;
    const fewerRepeats = achievedRepeats < baseRepeats;
    const betterCoverage = coverage.full > baseCoverage.full;
    if (!betterScore && !fewerRepeats && !betterCoverage) continue;

    alternatives.push({
      id: `alt-${++altId}`,
      label: candidate.label,
      reason: candidate.reason,
      apply: candidate.patch,
      mathMinimum: patchedFeasibility.totalLowerBoundSpelRepeats,
      achievedScore: result.achievedScore,
      achievedRepeats,
      spelCoverage: coverage,
      costToUser: candidate.cost,
      source: "deterministic",
    });
  }

  // Gerichte zoektocht naar 100%-coverage als die nog niet is gevonden.
  // Alleen in all-spellen modus en alleen als de baseline geen volledige
  // dekking heeft. Probeert nice-H groep-aantallen met bijpassend
  // spel-aantal — dit zijn de enige configs waarvan we weten dat ze
  // 100% coverage kunnen halen.
  const hasFullCoverage = alternatives.some(
    (a) => a.spelCoverage.full === a.spelCoverage.total && a.spelCoverage.total > 0
  );
  if (!isSolo && !hasFullCoverage && baseCoverage.full < baseCoverage.total && baseParams.scheduleMode === "all-spellen") {
    const poolCount = baseParams.usePools ? baseParams.poolNames.length : 1;
    const niceHTargets = [6, 10, 14, 18, 22]
      .map((pp) => pp * poolCount)
      .filter((gc) => gc >= poolCount * 4 && gc !== baseParams.groupCount);

    for (const targetGc of niceHTargets) {
      const perPool = Math.ceil(targetGc / poolCount);
      const matchesPerRound = Math.floor(perPool / 2);
      // Bij split layout: spellen per locatie = matchesPerRound
      const targetSpellen = baseParams.stationLayout === "split"
        ? matchesPerRound * Math.max(baseParams.locations.length, 1)
        : matchesPerRound;
      if (targetSpellen < 1) continue;

      const spelNames = baseParams.spellen.slice(0, targetSpellen);
      if (spelNames.length < targetSpellen) {
        for (let i = spelNames.length; i < targetSpellen; i++) {
          spelNames.push(`Extra spel ${i + 1}`);
        }
      }

      const patch: AlternativePatch = { groupCount: targetGc, spellen: spelNames };
      let patchedConfig: ConfigV2;
      try { patchedConfig = applyPatchToConfig(baseParams, patch); } catch { continue; }

      let result;
      try {
        result = generateBestPlan(patchedConfig, {
          optimizer: { maxIterations: 50, restarts: 1 },
          fastStrategiesOnly: true,
        });
      } catch { continue; }

      const coverage = computeSpelCoverage(result.plan, patchedConfig);
      if (coverage.full < coverage.total) continue;

      const patchedFeasibility = analyzePlanFeasibility(patchedConfig);
      alternatives.push({
        id: `alt-${++altId}`,
        label: `${targetGc} groepen (${perPool}/pool) + ${targetSpellen} spellen`,
        reason: result.achievedScore.repeatCount === 0
          ? `Alle ${coverage.total} groepen spelen alle spellen. 0 herhalingen.`
          : `Alle ${coverage.total} groepen spelen alle spellen. ${result.achievedScore.repeatCount} herhalingen.`,
        apply: patch,
        mathMinimum: patchedFeasibility.totalLowerBoundSpelRepeats,
        achievedScore: result.achievedScore,
        achievedRepeats: result.achievedScore.repeatCount,
        spelCoverage: coverage,
        costToUser: Math.abs(targetGc - baseParams.groupCount) * COST_GROUP +
          Math.abs(targetSpellen - baseParams.spellen.length) * COST_SPEL,
        source: "deterministic",
      });
      break; // Eén 100%-coverage suggestie is genoeg
    }
  }

  // Diversificatie: zorg dat de top-N alternatieven per strategie-type
  // minstens één vertegenwoordiger heeft. Categorieën:
  //   - "mode": scheduleMode wijziging
  //   - "structure": groepen, spellen, layout, movement, locaties
  //   - "rounds": extra rondes (speelrondes of bye-rondes)
  //   - "combo": 2-dimensionale combinatie
  function categorize(alt: Alternative): string {
    const keys = Object.keys(alt.apply);
    if (keys.includes("addTimeslots")) return "rounds";
    if (keys.includes("scheduleMode") && keys.length === 1) return "mode";
    if (keys.length >= 2) return "combo";
    return "structure";
  }

  // Sorteer op score (hoger = beter), dan op coverage (hoger = beter),
  // dan op repeats (lager = beter), dan op cost (lager = beter).
  alternatives.sort((a, b) => {
    if (a.achievedScore.totalScore !== b.achievedScore.totalScore)
      return b.achievedScore.totalScore - a.achievedScore.totalScore;
    if (a.spelCoverage.full !== b.spelCoverage.full)
      return b.spelCoverage.full - a.spelCoverage.full;
    if (a.achievedRepeats !== b.achievedRepeats)
      return a.achievedRepeats - b.achievedRepeats;
    return a.costToUser - b.costToUser;
  });

  // Selecteer: 1 per categorie, plus de beste 100%-coverage suggestie
  // als die bestaat. Vul aan op score.
  const selected: Alternative[] = [];
  const usedIds = new Set<string>();

  // Eerste pass: één per categorie. Voor "rounds" kies de minst
  // ingrijpende (laagste cost), voor de rest de beste score.
  const bestPerCategory = new Map<string, Alternative>();
  for (const alt of alternatives) {
    const cat = categorize(alt);
    const existing = bestPerCategory.get(cat);
    if (!existing) {
      bestPerCategory.set(cat, alt);
    } else if (cat === "rounds" && alt.costToUser < existing.costToUser) {
      bestPerCategory.set(cat, alt);
    }
  }
  for (const alt of bestPerCategory.values()) {
    selected.push(alt);
    usedIds.add(alt.id);
    if (selected.length >= maxAlternatives) break;
  }

  // Garandeer dat een 100%-coverage suggestie in de top-N zit als die
  // bestaat. Dit is de enige suggestie die de belofte "alle spellen"
  // volledig waarmaakt.
  if (selected.length < maxAlternatives) {
    const fullCoverage = alternatives.find(
      (a) => !usedIds.has(a.id) && a.spelCoverage.full === a.spelCoverage.total && a.spelCoverage.total > 0
    );
    if (fullCoverage) {
      selected.push(fullCoverage);
      usedIds.add(fullCoverage.id);
    }
  }

  // Tweede pass: vul aan op score
  if (selected.length < maxAlternatives) {
    for (const alt of alternatives) {
      if (usedIds.has(alt.id)) continue;
      selected.push(alt);
      if (selected.length >= maxAlternatives) break;
    }
  }

  return selected;
}
