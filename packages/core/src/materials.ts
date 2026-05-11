import type { ConfigV2 } from "./model";
import { findSpelByKey, type MaterialItem } from "./spel-registry";

export interface StationMaterials {
  stationId: string;
  stationName: string;
  spelName: string;
  baseId: string | null;
  isRenamed: boolean;
  items: MaterialItem[];
}

export interface MaterialTotals {
  name: string;
  quantity: number;
  unit: string;
  optional: boolean;
}

export interface MaterialOverrides {
  [activityTypeId: string]: MaterialItem[] | undefined;
}

export interface OrgSpelMaterials {
  [baseKey: string]: MaterialItem[] | undefined;
}

export function computeStationMaterials(
  config: ConfigV2,
  overrides?: MaterialOverrides,
  orgMaterials?: OrgSpelMaterials
): StationMaterials[] {
  return config.stations
    .filter((s) => s.activityTypeId !== "activity-pause")
    .map((station) => {
      const activity = config.activityTypes.find((a) => a.id === station.activityTypeId);
      const loc = config.locations.find((l) => l.id === station.locationId);
      const baseId = activity?.baseId ?? null;
      const spel = baseId ? findSpelByKey(baseId) : null;

      // Resolution: config override → org bibliotheek → SPEL_REGISTRY
      const overrideItems = overrides?.[station.activityTypeId];
      const orgItems = baseId ? orgMaterials?.[baseId] : undefined;
      const items = overrideItems ?? orgItems ?? spel?.materials ?? [];

      return {
        stationId: station.id,
        stationName: `${activity?.name ?? "Spel"} @ ${loc?.name ?? "Veld"}`,
        spelName: activity?.name ?? "Onbekend",
        baseId,
        isRenamed: !!(baseId && spel && activity && activity.name !== spel.name),
        items,
      };
    });
}

export function computeMaterialTotals(stationMaterials: StationMaterials[]): MaterialTotals[] {
  const map = new Map<string, MaterialTotals>();

  for (const station of stationMaterials) {
    for (const item of station.items) {
      const key = `${item.name}|${item.unit}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        if (!item.optional) existing.optional = false;
      } else {
        map.set(key, { ...item });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.optional !== b.optional) return a.optional ? 1 : -1;
    return a.name.localeCompare(b.name, "nl");
  });
}
