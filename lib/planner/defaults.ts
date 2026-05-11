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
      roundDurationMinutes: 15,
      transitionMinutes: 0,
      scheduleMode: "round-robin",
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
}

/** Bewezen pool-groottes voor 0-herhalingen met 2 pools (algebraic of paired-rotation). */
const PROVEN_2POOL_SIZES = [6, 8, 10, 12, 14];

/** Bewezen groepsgroottes voor 0-herhalingen met 1 pool (single-pool-rotation). */
const PROVEN_1POOL_SIZES = [6, 8, 10, 12];

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  // 1 pool presets
  ...PROVEN_1POOL_SIZES.map((groupCount): BuiltInPreset => ({
    key: `1pool-${groupCount}`,
    totalGroups: groupCount,
    totalSpellen: groupCount / 2,
    pools: 1,
    label: `${groupCount} groepen · ${groupCount / 2} spellen`,
    description: `${groupCount / 2} verschillende spellen op 1 veld. Elke groep speelt elke spel precies 1x.`,
  })),
  // 2 pool presets
  ...PROVEN_2POOL_SIZES.map((poolSize): BuiltInPreset => ({
    key: `2pool-${poolSize}`,
    totalGroups: poolSize * 2,
    totalSpellen: poolSize,
    pools: 2,
    label: `${poolSize * 2} groepen · ${poolSize} spellen`,
    description: `${poolSize} verschillende spellen op 2 velden, ${poolSize * 2} groepen verdeeld over 2 pools. Elke groep speelt elke spel precies 1x.`,
  })),
];

export function createPresetFromKey(key: string, configId?: string): ConfigV2 {
  const preset = BUILT_IN_PRESETS.find((p) => p.key === key);
  if (!preset) throw new Error(`Onbekend sjabloon: ${key}`);

  const groupNames: string[] = [];
  for (let i = 1; i <= preset.totalGroups; i++) {
    groupNames.push(`Groep ${i}`);
  }
  const spellen = ALL_SPELLEN.slice(0, preset.totalSpellen);

  if (preset.pools === 1) {
    const { config } = buildConfig({
      name: `Kroegentocht ${preset.totalGroups} groepen`,
      usePools: false,
      poolNames: [],
      groupCount: preset.totalGroups,
      groupNames,
      spellen,
      locations: ["Veld 1"],
      movementPolicy: "free",
      stationLayout: "split",
      scheduleMode: "all-spellen",
      startTime: "09:00",
      roundDurationMinutes: 15,
      transitionMinutes: 5,
      repeatPolicy: "soft",
    });
    if (configId) config.id = configId;
    return config;
  }

  const poolSize = preset.totalGroups / 2;
  const { config } = buildConfig({
    name: `Kroegentocht ${preset.totalGroups} groepen`,
    usePools: true,
    poolNames: ["Pool A", "Pool B"],
    groupCount: preset.totalGroups,
    groupNames,
    spellen,
    locations: ["Veld 1", "Veld 2"],
    movementPolicy: "blocks",
    stationLayout: "split",
    scheduleMode: "all-spellen",
    startTime: "09:00",
    roundDurationMinutes: 15,
    transitionMinutes: 5,
    repeatPolicy: "soft",
  });
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
