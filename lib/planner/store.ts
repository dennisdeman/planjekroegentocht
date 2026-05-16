"use client";

import {
  LEGACY_FORMAT_ERROR,
  applyCommandWithValidation,
  assertConfigV2,
  assertPlanV2,
  autoCreateGroupsFromParticipants,
  computeByesByTimeslot,
  generateBestPlan,
  hasHardErrors,
  parseParticipantsCsv,
  validatePlan,
  type AutoGroupOptions,
  type ConfigV2,
  type Id,
  type Issue,
  type ParticipantRow,
  type PlanCommandV2,
  type PlanV2,
} from "@core";
import {
  IndexedDbPlannerStorage,
  InMemoryPlannerStorage,
  type ConfigRecord,
  type PlanRecord,
  type PlannerStorage,
} from "@storage";
import { create } from "zustand";
import { ApiPlannerStorage } from "./api-storage";
import { createPresetFromKey, createEmptyConfigV2, splitGroupsAcrossSegments } from "./defaults";

type PlannerViewMode = "table";
type StorageMode = "local" | "cloud";
type MessageType = "success" | "error" | "info";

export interface UiMessage {
  text: string;
  type: MessageType;
}

interface PlannerState {
  initialized: boolean;
  dashboardLoading: boolean;
  storageMode: StorageMode;
  storageError: string | null;
  uiMessage: UiMessage | null;
  storage: PlannerStorage | null;
  dirty: boolean;
  configRecords: ConfigRecord[];
  planRecords: PlanRecord[];
  activeConfig: ConfigV2;
  activePlan: PlanV2 | null;
  issues: Issue[];
  byesByTimeslot: Record<Id, Id[]>;
  participantImportWarnings: string[];
  participantImportCount: number;
  viewMode: PlannerViewMode;
  init: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  newConfig: () => void;
  usePreset: (key: string) => void;
  loadConfig: (configId: Id) => Promise<void>;
  loadPlan: (planId: Id) => Promise<void>;
  loadInlineDraft: (config: unknown, plan: unknown) => void;
  updateConfig: (patch: Partial<ConfigV2>) => void;
  importParticipants: (rawCsv: string) => void;
  importParticipantRows: (
    rows: ParticipantRow[],
    warnings?: string[],
    options?: AutoGroupOptions
  ) => void;
  generatePlan: () => Promise<boolean>;
  previewDiagnosis: () => ConfigDiagnosis;
  validateCurrentPlan: () => void;
  applyPlanCommand: (command: PlanCommandV2) => boolean;
  saveCurrent: () => Promise<void>;
  deleteConfigRecord: (configId: Id) => Promise<void>;
  deletePlanRecord: (planId: Id) => Promise<void>;
  setStorageMode: (mode: StorageMode) => Promise<void>;
  clearMessage: () => void;
  showMessage: (message: string, type?: MessageType) => void;
}

export interface ConfigWarning {
  /** Korte titel / wat is het probleem */
  title: string;
  /** Uitleg wat dit betekent voor de planning */
  body: string;
  /** Concrete suggestie wat je kunt aanpassen */
  advice: string;
}

export interface ConfigDiagnosis {
  /** Blokkerende fout — generatie wordt afgebroken. */
  error: string | null;
  /** Waarschuwingen — generatie loopt door, maar gebruiker wordt geïnformeerd. */
  warnings: ConfigWarning[];
}

/**
 * Pre-validatie: detecteer configuratiefouten die de generator laten falen,
 * en optionele waarschuwingen voor edge-cases.
 */
function diagnoseConfig(config: ConfigV2): ConfigDiagnosis {
  const warnings: ConfigWarning[] = [];
  const isSolo = config.scheduleSettings.mode === "solo";
  const activeSlots = config.timeslots.filter((t) => t.kind === "active").length;

  // Groepen per pool berekenen
  const poolGroups: Record<string, number> = {};
  for (const g of config.groups) {
    const pool = g.segmentId ?? "__default__";
    poolGroups[pool] = (poolGroups[pool] ?? 0) + 1;
  }

  // Stations per locatie tellen (excl. pauze)
  const stationsPerLoc: Record<string, number> = {};
  for (const s of config.stations) {
    if (s.activityTypeId === "activity-pause") continue;
    stationsPerLoc[s.locationId] = (stationsPerLoc[s.locationId] ?? 0) + 1;
  }
  const totalStations = Object.values(stationsPerLoc).reduce((a, b) => a + b, 0);

  // Solo-specifieke pre-checks (geen "matches per ronde", elke groep speelt 1x per slot)
  if (isSolo) {
    if (config.locations.length === 0) {
      return { error: "Geen kroegen toegevoegd. Voeg minstens 1 locatie toe.", warnings };
    }
    if (totalStations === 0) {
      return { error: "Geen spellen gekoppeld aan kroegen. Klik op een kroeg om een spel te kiezen.", warnings };
    }
    const totalGroups = config.groups.length;
    if (totalGroups === 0) {
      return { error: "Geen groepen toegevoegd. Voeg minstens 1 groep toe.", warnings };
    }
    const locCount = config.locations.length;
    const gamesEnabled = config.gamesEnabled !== false;
    const unlinked = gamesEnabled ? locCount - totalStations : 0;
    if (
      activeSlots > totalStations &&
      config.constraints.avoidRepeatActivityType === "hard"
    ) {
      return {
        error: `Er zijn ${activeSlots} slots maar maar ${totalStations} speelbare kroeg${totalStations !== 1 ? "en" : ""} (kroeg met spel-koppeling). Groepen moeten kroegen herbezoeken, maar "Herhaal hetzelfde spel" staat op Verbieden. Verhoog het aantal speelbare kroegen, verlaag slots, of zet 'Herhaal spel' op Toestaan/Liever niet.`,
        warnings,
      };
    }
    // Niet-blokkerende waarschuwingen voor Solo:
    // Eerst: kroegen zonder spel (root cause die de andere warnings vertroebelt).
    if (unlinked > 0) {
      warnings.push({
        title: `${unlinked} kroeg${unlinked > 1 ? "en" : ""} zonder spel gekoppeld`,
        body: `Je hebt ${locCount} kroegen toegevoegd, maar maar ${totalStations} ${totalStations === 1 ? "kroeg heeft" : "kroegen hebben"} een spel gekoppeld. De ${unlinked} kroeg${unlinked > 1 ? "en zonder" : " zonder"} spel ${unlinked > 1 ? "tellen" : "telt"} niet mee in de planning.`,
        advice: `Klik bij elke spel-loze kroeg op "🎮 + Kies spel" in de Locaties-lijst om een spel te koppelen. Of verwijder de spel-loze kroegen.`,
      });
    }
    if (totalGroups > totalStations) {
      const onBye = totalGroups - totalStations;
      warnings.push({
        title: `Meer groepen dan speelbare kroegen (${totalGroups} > ${totalStations})`,
        body: `Er passen maar ${totalStations} groepen tegelijk in een speelbare kroeg (1 per kroeg). De resterende ${onBye} groep${onBye > 1 ? "en" : ""} ${onBye > 1 ? "zitten" : "zit"} per ronde op bye en speel${onBye > 1 ? "en" : "t"} dus niet mee. Over de rondes wisselt wie er op bye zit.`,
        advice: `Wil je dat alle groepen elke ronde spelen? Voeg ${onBye} kroeg + spel-koppeling extra toe, of verklein de groepen door er enkele samen te voegen.`,
      });
    }
    if (activeSlots > totalStations && config.constraints.avoidRepeatActivityType !== "hard") {
      const extra = activeSlots - totalStations;
      warnings.push({
        title: `Meer slots dan speelbare kroegen (${activeSlots} > ${totalStations})`,
        body: `Je hebt ${activeSlots} slots gepland maar maar ${totalStations} speelbare kroeg${totalStations !== 1 ? "en (kroeg met spel-koppeling)" : " (kroeg met spel-koppeling)"}. Groepen moeten daarom in ${extra} slot${extra > 1 ? "s" : ""} terug naar een eerder bezochte kroeg (en dus hetzelfde spel nogmaals spelen).`,
        advice: `Wil je elke kroeg precies 1× per groep? Verlaag het aantal slots naar ${totalStations}, of voeg ${extra} extra kroeg + spel-koppeling toe.`,
      });
    }
    if (activeSlots < totalStations) {
      const unvisited = totalStations - activeSlots;
      warnings.push({
        title: `Minder slots dan speelbare kroegen (${activeSlots} < ${totalStations})`,
        body: `Je hebt ${totalStations} speelbare kroegen maar maar ${activeSlots} slots. Elke groep bezoekt dus maar ${activeSlots} van de ${totalStations} kroegen — ${unvisited} kroeg${unvisited > 1 ? "en blijven" : " blijft"} ongebruikt voor sommige groepen.`,
        advice: `Wil je dat elke groep álle kroegen bezoekt? Verhoog het aantal slots naar ${totalStations}, of verwijder ${unvisited} kroeg${unvisited > 1 ? "en" : ""}.`,
      });
    }
    // Skip de Vs-specifieke checks hieronder.
  } else {
    // Bij blocks-mode: check of elke pool genoeg stations heeft op zijn locatie
    if (config.movementPolicy === "blocks" && config.locationBlocks?.length) {
      for (const block of config.locationBlocks) {
        for (const [segId, locId] of Object.entries(block.segmentLocationMap)) {
          const groupCount = poolGroups[segId] ?? 0;
          const matchesNeeded = Math.floor(groupCount / 2);
          const stationCount = stationsPerLoc[locId] ?? 0;
          if (matchesNeeded > stationCount) {
            const segName = config.segments.find((s) => s.id === segId)?.name ?? segId;
            const locName = config.locations.find((l) => l.id === locId)?.name ?? locId;
            return {
              error: `${segName} heeft ${groupCount} groepen (${matchesNeeded} spelletjes per ronde), maar ${locName} heeft maar ${stationCount} stations. Voeg ${matchesNeeded - stationCount} spel${matchesNeeded - stationCount > 1 ? "en" : ""} toe, of verplaats groepen naar de andere pool.`,
              warnings,
            };
          }
        }
      }
    }

    // Zonder blocks: check totaal stations vs totaal spelletjes
    if (config.movementPolicy !== "blocks") {
      for (const [pool, count] of Object.entries(poolGroups)) {
        const matchesNeeded = Math.floor(count / 2);
        const poolCount = Object.keys(poolGroups).length;
        const stationsForPool = Math.floor(totalStations / Math.max(poolCount, 1));
        if (matchesNeeded > stationsForPool) {
          const segName = config.segments.find((s) => s.id === pool)?.name ?? (pool === "__default__" ? "De configuratie" : pool);
          return {
            error: `${segName} heeft ${count} groepen (${matchesNeeded} spelletjes per ronde), maar er zijn maar ${stationsForPool} stations beschikbaar. Voeg spellen toe of verplaats groepen.`,
            warnings,
          };
        }
      }
    }
  }

  // Check: genoeg actieve tijdsloten (geldt voor beide modi)
  if (activeSlots === 0) {
    return { error: "Er zijn geen actieve tijdsloten. Voeg rondes toe in het tijdschema.", warnings };
  }

  return { error: null, warnings };
}

function chooseStorage(mode: StorageMode): PlannerStorage {
  if (mode === "cloud") {
    return new ApiPlannerStorage("/api/planner");
  }
  if (typeof window !== "undefined" && "indexedDB" in window) {
    return new IndexedDbPlannerStorage("kroegentocht.v2.planner");
  }
  return new InMemoryPlannerStorage();
}

function parseConfigStrict(value: unknown): ConfigV2 {
  return assertConfigV2(value);
}

function parsePlanStrict(value: unknown): PlanV2 {
  return assertPlanV2(value);
}

function buildByes(config: ConfigV2, plan: PlanV2 | null): Record<Id, Id[]> {
  if (!plan) {
    return Object.fromEntries(config.timeslots.map((slot) => [slot.id, []]));
  }
  return computeByesByTimeslot(config, plan);
}

function setStorageModeLocalStorage(mode: StorageMode): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem("kroegentocht.storageMode.v2", mode);
}

function getStorageModeFromLocalStorage(): StorageMode | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const value = localStorage.getItem("kroegentocht.storageMode.v2");
  if (value === "local" || value === "cloud") {
    return value;
  }
  return null;
}

function setCurrentIds(configId: Id | null, planId: Id | null): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (configId) {
    localStorage.setItem("kroegentocht.config.v2.current", configId);
  }
  if (planId) {
    localStorage.setItem("kroegentocht.plan.v2.current", planId);
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base: string, used: Set<string>, fallbackPrefix: string): string {
  const normalizedBase = slugify(base) || fallbackPrefix;
  let id = normalizedBase;
  let seq = 2;
  while (used.has(id)) {
    id = `${normalizedBase}-${seq}`;
    seq += 1;
  }
  used.add(id);
  return id;
}

function extractPoolLabelFromRow(row: ParticipantRow): string | null {
  const classValue = row.className?.trim();
  if (classValue) {
    if (/^pool\s+/i.test(classValue)) {
      return classValue;
    }
    if (/^[a-z]$/i.test(classValue)) {
      return `Pool ${classValue.toUpperCase()}`;
    }
  }
  const nameValue = row.name.trim();
  const poolMatch = nameValue.match(/^pool\s+([a-z0-9]+)/i);
  if (poolMatch?.[1]) {
    return `Pool ${poolMatch[1].toUpperCase()}`;
  }
  return null;
}

function createGroupsFromRows(rows: ParticipantRow[]): ConfigV2["groups"] {
  const used = new Set<string>();
  return rows.map((row, index) => {
    const id = uniqueId(`group-${row.name}`, used, `group-${index + 1}`);
    return {
      id,
      name: row.name.trim() || `Groep ${index + 1}`,
    };
  });
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  initialized: false,
  dashboardLoading: false,
  storageMode: process.env.NEXT_PUBLIC_STORAGE_MODE === "cloud" ? "cloud" : "local",
  storageError: null,
  uiMessage: null,
  storage: null,
  dirty: false,
  configRecords: [],
  planRecords: [],
  activeConfig: createEmptyConfigV2(),
  activePlan: null,
  issues: [],
  byesByTimeslot: {},
  participantImportWarnings: [],
  participantImportCount: 0,
  viewMode: "table",

  init: async () => {
    if (get().initialized) {
      return;
    }
    const persistedMode = getStorageModeFromLocalStorage();
    const mode = persistedMode ?? get().storageMode;
    const storage = chooseStorage(mode);

    set({
      storageMode: mode,
      storage,
      initialized: true,
      storageError: null,
      uiMessage: null,
    });
    await get().refreshDashboard();
  },

  refreshDashboard: async () => {
    const { storage } = get();
    if (!storage) {
      return;
    }
    set({ dashboardLoading: true });
    try {
      const [rawConfigs, rawPlans] = await Promise.all([storage.listConfigs(), storage.listPlans()]);
      const configRecords = rawConfigs.map((record) => ({
        ...record,
        config: parseConfigStrict(record.config),
      }));
      const planRecords = rawPlans.map((record) => ({
        ...record,
        plan: parsePlanStrict(record.plan),
      }));
      set({
        configRecords,
        planRecords,
        dashboardLoading: false,
        storageError: null,
      });
    } catch (error) {
      set({
        dashboardLoading: false,
        storageError: error instanceof Error ? error.message : "Failed to load dashboard data.",
      });
      throw error;
    }
  },

  newConfig: () => {
    const config = createEmptyConfigV2();
    set({
      activeConfig: config,
      activePlan: null,
      issues: [],
      byesByTimeslot: buildByes(config, null),
      participantImportWarnings: [],
      participantImportCount: 0,
      dirty: false,
      uiMessage: null,
    });
  },

  usePreset: (key: string) => {
    const config = createPresetFromKey(key);
    set({
      activeConfig: config,
      activePlan: null,
      issues: [],
      byesByTimeslot: buildByes(config, null),
      participantImportWarnings: [],
      participantImportCount: 0,
      dirty: true,
      uiMessage: null,
    });
  },

  loadConfig: async (configId: Id) => {
    const { storage } = get();
    if (!storage) {
      return;
    }
    try {
      const configRaw = await storage.loadConfig(configId);
      if (!configRaw) {
        return;
      }
      const config = parseConfigStrict(configRaw);
      const planRecords = await storage.listPlans(config.id);
      const latestPlanRaw = planRecords[0]?.plan ?? null;
      const latestPlan = latestPlanRaw ? parsePlanStrict(latestPlanRaw) : null;
      const issues = latestPlan ? validatePlan(latestPlan, config) : [];
      set({
        activeConfig: config,
        activePlan: latestPlan,
        issues,
        byesByTimeslot: buildByes(config, latestPlan),
        storageError: null,
        dirty: false,
        uiMessage: null,
      });
      setCurrentIds(config.id, latestPlan?.id ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : LEGACY_FORMAT_ERROR;
      set({ storageError: message, uiMessage: { text: message, type: "error" } });
      throw error;
    }
  },

  loadPlan: async (planId: Id) => {
    const { storage } = get();
    if (!storage) {
      return;
    }
    try {
      const planRaw = await storage.loadPlan(planId);
      if (!planRaw) {
        return;
      }
      const plan = parsePlanStrict(planRaw);
      const configRaw = await storage.loadConfig(plan.configId);
      if (!configRaw) {
        return;
      }
      const config = parseConfigStrict(configRaw);
      const issues = validatePlan(plan, config);
      set({
        activeConfig: config,
        activePlan: plan,
        issues,
        byesByTimeslot: buildByes(config, plan),
        storageError: null,
        dirty: false,
        uiMessage: null,
      });
      setCurrentIds(config.id, plan.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : LEGACY_FORMAT_ERROR;
      set({ storageError: message, uiMessage: { text: message, type: "error" } });
      throw error;
    }
  },

  loadInlineDraft: (config: unknown, plan: unknown) => {
    const strictConfig = parseConfigStrict(config);
    const strictPlan = parsePlanStrict(plan);
    const issues = validatePlan(strictPlan, strictConfig);
    set({
      activeConfig: strictConfig,
      activePlan: strictPlan,
      issues,
      byesByTimeslot: buildByes(strictConfig, strictPlan),
      storageError: null,
      uiMessage: null,
      dirty: true,
    });
    setCurrentIds(strictConfig.id, strictPlan.id);
  },

  updateConfig: (patch: Partial<ConfigV2>) => {
    const { activeConfig, activePlan } = get();
    const nextConfig = parseConfigStrict({ ...activeConfig, ...patch });
    const issues = activePlan ? validatePlan(activePlan, nextConfig) : [];
    set({
      activeConfig: nextConfig,
      issues,
      byesByTimeslot: buildByes(nextConfig, activePlan),
      dirty: true,
    });
  },

  importParticipants: (rawCsv: string) => {
    const parsed = parseParticipantsCsv(rawCsv);
    get().importParticipantRows(parsed.rows, parsed.warnings, { fixedSize: 2 });
  },

  importParticipantRows: (rows, warnings = [], options = { fixedSize: 2 }) => {
    const participantCount = rows.length;
    const { activeConfig } = get();
    const fixedSize = Math.max(1, options.fixedSize ?? 2);

    let nextSegments = activeConfig.segments;
    let nextGroups: ConfigV2["groups"];

    if (fixedSize === 1) {
      nextGroups = createGroupsFromRows(rows);
      if (activeConfig.segmentsEnabled) {
        const poolLabels = Array.from(
          new Set(rows.map((row) => extractPoolLabelFromRow(row)).filter((value): value is string => Boolean(value)))
        );
        if (poolLabels.length > 0) {
          const usedSegmentIds = new Set<string>();
          nextSegments = poolLabels.map((label, index) => ({
            id: uniqueId(`pool-${label}`, usedSegmentIds, `pool-${index + 1}`),
            name: label,
          }));
          const segmentByLabel = new Map(nextSegments.map((segment) => [segment.name.toLowerCase(), segment.id]));
          nextGroups = nextGroups.map((group, index) => {
            const label = extractPoolLabelFromRow(rows[index])?.toLowerCase();
            return {
              ...group,
              segmentId: label ? segmentByLabel.get(label) ?? nextSegments[0].id : nextSegments[0].id,
            };
          });
        } else {
          nextGroups = splitGroupsAcrossSegments({ ...activeConfig, groups: nextGroups }).groups;
        }
      }
    } else {
      const autoGroups = autoCreateGroupsFromParticipants(rows, options);
      nextGroups = activeConfig.segmentsEnabled
        ? splitGroupsAcrossSegments({ ...activeConfig, groups: autoGroups }).groups
        : autoGroups;
    }

    get().updateConfig({
      groups: nextGroups,
      ...(activeConfig.segmentsEnabled ? { segments: nextSegments } : {}),
    });
    set({
      participantImportWarnings: warnings,
      participantImportCount: participantCount,
    });
  },

  previewDiagnosis: () => {
    const { activeConfig } = get();
    return diagnoseConfig(activeConfig);
  },

  generatePlan: async () => {
    const { activeConfig, storage } = get();
    if (
      activeConfig.movementPolicy === "blocks" &&
      (!activeConfig.locationBlocks || activeConfig.locationBlocks.length === 0)
    ) {
      set({
        uiMessage: {
          text: 'Geen locatieblokken ingesteld. Klik bij "Blokken" op "Auto: wissel velden na pauze" of maak handmatig blokken aan.',
          type: "error",
        },
      });
      return false;
    }

    // Pre-validatie: check of er genoeg stations zijn per locatie voor de pools
    const diagnosis = diagnoseConfig(activeConfig);
    if (diagnosis.error) {
      set({ uiMessage: { text: diagnosis.error, type: "error" } });
      return false;
    }

    try {
      const generated = generateBestPlan(activeConfig);
      const issues = validatePlan(generated.plan, activeConfig);
      const errorCount = issues.filter((i) => i.severity === "error").length;
      const warnCount = issues.filter((i) => i.severity === "warn").length;
      const issuesSuffix =
        errorCount > 0
          ? ` ${errorCount} fout${errorCount > 1 ? "en" : ""} gevonden.`
          : warnCount > 0
            ? ` ${warnCount} waarschuwing${warnCount > 1 ? "en" : ""}.`
            : "";
      set({
        activePlan: generated.plan,
        issues,
        byesByTimeslot: buildByes(activeConfig, generated.plan),
        dirty: false,
        uiMessage: {
          text: `Planning gegenereerd.${issuesSuffix}`,
          type: errorCount > 0 ? "error" : warnCount > 0 ? "info" : "success",
        },
      });

      // Auto-save config + plan
      if (storage) {
        await storage.saveConfig(activeConfig);
        await storage.savePlan(generated.plan);
        setCurrentIds(activeConfig.id, generated.plan.id);
        await get().refreshDashboard();
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generatie mislukt.";
      if (message.includes("No location block found for timeslot")) {
        set({
          uiMessage: {
            text: 'Locatieblok ontbreekt voor een tijdslot. Werk je blokken bij (of klik "Auto: wissel velden na pauze") en genereer opnieuw.',
            type: "error",
          },
        });
        return false;
      }
      set({
        uiMessage: { text: message, type: "error" },
      });
      return false;
    }
  },

  validateCurrentPlan: () => {
    const { activeConfig, activePlan } = get();
    if (!activePlan) {
      return;
    }
    set({ issues: validatePlan(activePlan, activeConfig) });
  },

  applyPlanCommand: (command: PlanCommandV2) => {
    const { activePlan, activeConfig } = get();
    if (!activePlan) {
      return false;
    }
    const result = applyCommandWithValidation(activePlan, activeConfig, command);
    if (!result.valid) {
      const firstHard = result.issues.find((issue) => issue.severity === "error");
      set({ uiMessage: { text: firstHard?.message ?? "Wijziging afgekeurd door harde regel.", type: "error" } });
      return false;
    }
    set({
      activePlan: result.plan,
      issues: result.issues,
      byesByTimeslot: buildByes(activeConfig, result.plan),
      uiMessage: null,
      dirty: true,
    });
    return true;
  },

  saveCurrent: async () => {
    const { storage, activeConfig, activePlan } = get();
    if (!storage) {
      return;
    }
    await storage.saveConfig(activeConfig);
    if (activePlan) {
      await storage.savePlan(activePlan);
    }
    setCurrentIds(activeConfig.id, activePlan?.id ?? null);
    set({ dirty: false });
    await get().refreshDashboard();
  },

  deleteConfigRecord: async (configId: Id) => {
    const { storage, activeConfig, activePlan } = get();
    if (!storage) {
      return;
    }
    try {
      const relatedPlans = await storage.listPlans(configId);
      for (const planRecord of relatedPlans) {
        await storage.deletePlan(planRecord.id);
      }
      await storage.deleteConfig(configId);

      let nextConfig = activeConfig;
      let nextPlan = activePlan;
      if (activeConfig.id === configId) {
        nextConfig = createEmptyConfigV2();
        nextPlan = null;
      } else if (activePlan?.configId === configId) {
        nextPlan = null;
      }

      set({
        activeConfig: nextConfig,
        activePlan: nextPlan,
        issues: nextPlan ? validatePlan(nextPlan, nextConfig) : [],
        byesByTimeslot: buildByes(nextConfig, nextPlan),
        uiMessage: { text: "Configuratie verwijderd.", type: "success" },
      });
      setCurrentIds(nextConfig.id, nextPlan?.id ?? null);
      await get().refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verwijderen mislukt.";
      set({ uiMessage: { text: `Kon configuratie niet verwijderen: ${message}`, type: "error" } });
    }
  },

  deletePlanRecord: async (planId: Id) => {
    const { storage, activeConfig, activePlan } = get();
    if (!storage) {
      return;
    }
    try {
      await storage.deletePlan(planId);
      const nextPlan = activePlan?.id === planId ? null : activePlan;
      set({
        activePlan: nextPlan,
        issues: nextPlan ? validatePlan(nextPlan, activeConfig) : [],
        byesByTimeslot: buildByes(activeConfig, nextPlan),
        uiMessage: { text: "Planning verwijderd.", type: "success" },
      });
      setCurrentIds(activeConfig.id, nextPlan?.id ?? null);
      await get().refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verwijderen mislukt.";
      set({ uiMessage: { text: `Kon planning niet verwijderen: ${message}`, type: "error" } });
    }
  },

  setStorageMode: async (mode: StorageMode) => {
    const storage = chooseStorage(mode);
    setStorageModeLocalStorage(mode);
    set({
      storageMode: mode,
      storage,
      storageError: null,
      uiMessage: null,
    });
    await get().refreshDashboard();
  },

  clearMessage: () => {
    set({ uiMessage: null });
  },

  showMessage: (message: string, type: MessageType = "info") => {
    set({ uiMessage: { text: message, type } });
  },
}));
