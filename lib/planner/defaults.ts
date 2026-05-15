import type { ConfigV2, Id } from "@core";
import { buildConfig, getSpelNames } from "@core";

export function createEmptyConfigV2(configId = `cfg-v2-${Date.now()}`): ConfigV2 {
  return {
    id: configId,
    name: "Nieuwe kroegentocht",
    segmentsEnabled: false,
    segments: [],
    groups: [],
    locations: [],
    activityTypes: [],
    stations: [],
    timeslots: [],
    movementPolicy: "free",
    locationBlocks: [],
    relaxedBlockTimeslotIds: [],
    constraints: {
      matchupMaxPerPair: 1,
      requireSameSegmentForMatches: true,
      avoidRepeatActivityType: "soft",
    },
    scheduleSettings: {
      roundDurationMinutes: 30,
      transitionMinutes: 10,
      scheduleMode: "round-robin",
      mode: "solo",
    },
  };
}

// ---------------------------------------------------------------------------
// Ingebouwde sjablonen — bewezen 0-herhalingen configuraties
// ---------------------------------------------------------------------------

const ALL_SPELLEN = getSpelNames();

export interface BuiltInPreset {
  /** Unieke key voor de preset */
  key: string;
  totalGroups: number;
  totalSpellen: number;
  pools: number;
  label: string;
  description: string;
  mode: "solo" | "vs";
}

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  // --- Vrijgezellen / single-group setups ---
  {
    key: "solo-1g-4",
    totalGroups: 1,
    totalSpellen: 4,
    pools: 1,
    mode: "solo",
    label: "Vrijgezellen · 4 kroegen",
    description: "1 groep door 4 kroegen — ideaal voor een vrijgezellenavond. 4 spellen verdeeld over 4 cafés.",
  },
  {
    key: "solo-1g-6",
    totalGroups: 1,
    totalSpellen: 6,
    pools: 1,
    mode: "solo",
    label: "Vrijgezellen · 6 kroegen",
    description: "1 groep door 6 kroegen — uitgebreidere vrijgezellenavond met 6 verschillende drankspellen.",
  },

  // --- Solo-mode: 1 spel per kroeg, elke groep loopt alleen ---
  {
    key: "solo-4",
    totalGroups: 4,
    totalSpellen: 4,
    pools: 1,
    mode: "solo",
    label: "4 groepen · 4 kroegen",
    description: "Mini-tocht voor 4 groepen. Elke groep bezoekt elke kroeg precies 1×, geen bye, geen herhaling.",
  },
  {
    key: "solo-6",
    totalGroups: 6,
    totalSpellen: 6,
    pools: 1,
    mode: "solo",
    label: "6 groepen · 6 kroegen",
    description: "Standaard kroegentocht. 6 groepen, 6 kroegen — ideale 1-op-1 indeling.",
  },
  {
    key: "solo-8",
    totalGroups: 8,
    totalSpellen: 8,
    pools: 1,
    mode: "solo",
    label: "8 groepen · 8 kroegen",
    description: "Grote tocht. 8 groepen door 8 kroegen, geen bye, geen herhaling.",
  },
  {
    key: "solo-bye-6-4",
    totalGroups: 6,
    totalSpellen: 4,
    pools: 1,
    mode: "solo",
    label: "6 groepen · 4 kroegen (korte tocht)",
    description: "Kortere avond: 6 groepen, 4 kroegen. Elke ronde zitten 2 groepen op bye — rouleert over de slots.",
  },
  {
    key: "solo-routes-12",
    totalGroups: 12,
    totalSpellen: 6,
    pools: 2,
    mode: "solo",
    label: "12 groepen · 6 kroegen · 2 routes",
    description: "Grote groep gesplitst in twee parallelle routes (6 groepen per route). Beide routes lopen tegelijk hun eigen 6 kroegen af.",
  },

  // --- Vs-mode: 2 groepen per kroeg, tegen elkaar ---
  {
    key: "vs-6",
    totalGroups: 6,
    totalSpellen: 3,
    pools: 1,
    mode: "vs",
    label: "6 groepen · 3 kroegen (Vs)",
    description: "Klassieke Vs-modus. Elke kroeg heeft 2 groepen die tegen elkaar spelen, 3 kroegen actief per ronde.",
  },
];

export function createPresetFromKey(key: string, configId?: string): ConfigV2 {
  const preset = BUILT_IN_PRESETS.find((p) => p.key === key);
  if (!preset) throw new Error(`Onbekend sjabloon: ${key}`);

  const groupNames: string[] = [];
  for (let i = 1; i <= preset.totalGroups; i++) {
    groupNames.push(`Groep ${i}`);
  }
  const spellen = ALL_SPELLEN.slice(0, preset.totalSpellen);

  const baseParams = {
    name: `Kroegentocht ${preset.totalGroups} groepen`,
    groupCount: preset.totalGroups,
    groupNames,
    spellen,
    locations: spellen.map((_, i) => `Kroeg ${i + 1}`),
    movementPolicy: "free" as const,
    stationLayout: "split" as const,
    scheduleMode: "all-spellen" as const,
    startTime: "19:30",
    roundDurationMinutes: 30,
    transitionMinutes: 10,
    repeatPolicy: "soft" as const,
    mode: preset.mode,
    enableBreak: false,
  };

  let config: ConfigV2;
  if (preset.pools === 1) {
    const built = buildConfig({
      ...baseParams,
      usePools: false,
      poolNames: [],
    });
    config = built.config;
  } else {
    const built = buildConfig({
      ...baseParams,
      usePools: true,
      poolNames: ["Route A", "Route B"],
    });
    config = built.config;
  }

  // Strip locaties + stations: gebruiker vult zelf de kroegen aan (via bulkzoek
  // of handmatig). De activityTypes (spel-bibliotheek) blijft staan en wordt
  // automatisch 1-op-1 aan toegevoegde kroegen gekoppeld door de configurator.
  config = { ...config, locations: [], stations: [] };

  if (configId) config.id = configId;
  return config;
}

/** @deprecated Achterwaartse compatibiliteit */
export function createPresetConfig(poolSize: number, configId?: string): ConfigV2 {
  return createPresetFromKey(`2pool-${poolSize}`, configId);
}

/** @deprecated Gebruik createPresetConfig(9) voor achterwaartse compatibiliteit met tests. */
export function createBasisschoolPresetConfig(configId?: string): ConfigV2 {
  return createPresetConfig(9, configId);
}

export function splitGroupsAcrossSegments(config: ConfigV2): ConfigV2 {
  const segments = config.segments;
  if (segments.length < 2) {
    return config;
  }
  const nextGroups = [...config.groups]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((group, index) => ({
      ...group,
      segmentId: segments[index % segments.length].id,
    }));
  return { ...config, groups: nextGroups };
}

export function activeTimeslotIds(config: ConfigV2): Id[] {
  return config.timeslots
    .filter((slot) => slot.kind === "active")
    .sort((a, b) => a.index - b.index)
    .map((slot) => slot.id);
}
