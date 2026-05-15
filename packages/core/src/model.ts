export type Id = string;

export interface SegmentV2 {
  id: Id;
  name: string;
}

export interface GroupV2 {
  id: Id;
  name: string;
  segmentId?: Id;
}

export interface TeamMember {
  id: Id;
  name: string;
  email?: string;
  phone?: string;
  is18Plus?: boolean;
  notes?: string;
}

export interface LocationV2 {
  id: Id;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  /** e.g. "€ 10-20" — passthrough from Serper places result. */
  priceLevel?: string;
  category?: string;
  /** External provider id (e.g. Serper/Google CID) for dedup on search results. */
  sourceId?: string;
  /** Type café: 'bar' | 'pub' | 'cafe' | 'nightclub'. Wordt gezet bij bulk-zoek of in manual modal. */
  venueType?: string;
}

export interface ActivityTypeV2 {
  id: Id;
  name: string;
  baseId?: string | null;
}

export interface StationV2 {
  id: Id;
  name: string;
  locationId: Id;
  activityTypeId: Id;
  capacityGroupsMin: number;
  capacityGroupsMax: number;
}

export interface TimeslotV2 {
  id: Id;
  start: string;
  end: string;
  label?: string;
  kind: "active" | "break";
  index: number;
}

export interface LocationBlockV2 {
  id: Id;
  name: string;
  timeslotIds: Id[];
  segmentLocationMap: Record<string, string>;
}

export interface ConstraintsV2 {
  matchupMaxPerPair: number;
  requireSameSegmentForMatches: boolean;
  avoidRepeatActivityType: "off" | "soft" | "hard";
}

export type ScheduleMode = "all-spellen" | "round-robin";

export type KroegentochtMode = "solo" | "vs";

export interface ScheduleSettingsV2 {
  roundDurationMinutes: number;
  transitionMinutes: number;
  /**
   * Eerste-klas keuze van de gebruiker tussen spelvolledigheid (`all-spellen` —
   * elke groep speelt elke spel) en tegenstander-volledigheid (`round-robin` —
   * elk paar groepen speelt exact één keer). Bepaalt onder andere de
   * scoring-gewichten en de wiskundige ondergrenzen die `analyzePlanFeasibility`
   * berekent. Verplicht; geen fallback. Zie `docs/generator-design.md` §1.3.
   */
  scheduleMode: ScheduleMode;
  /**
   * Kroegentocht-modus:
   * - `solo`: elke groep loopt alleen, 1 groep per kroeg per slot (capaciteit 1).
   * - `vs`: twee groepen ontmoeten elkaar per kroeg en spelen tegen elkaar (capaciteit 2).
   * Default `solo`. Drijft station-capaciteit, generator-pad, UI-rendering en
   * default scoring.
   */
  mode?: KroegentochtMode;
}

export interface PauseActivityV2 {
  name: string;
  stationName?: string;
}

export interface ConfigV2 {
  id: Id;
  name: string;
  segmentsEnabled: boolean;
  segments: SegmentV2[];
  groups: GroupV2[];
  locations: LocationV2[];
  activityTypes: ActivityTypeV2[];
  stations: StationV2[];
  timeslots: TimeslotV2[];
  movementPolicy: "free" | "blocks";
  locationBlocks?: LocationBlockV2[];
  // Advisor helper: per-slot blokkering versoepelen zonder global "free".
  relaxedBlockTimeslotIds?: Id[];
  constraints: ConstraintsV2;
  scheduleSettings: ScheduleSettingsV2;
  pauseActivity?: PauseActivityV2;
  materialOverrides?: Record<Id, import("./spel-registry").MaterialItem[]>;
}

export interface PlanAllocationV2 {
  id: Id;
  timeslotId: Id;
  stationId: Id;
  groupIds: Id[];
  meta?: { notes?: string };
}

export interface PlanV2 {
  id: Id;
  configId: Id;
  allocations: PlanAllocationV2[];
  version: number;
  updatedAt: string;
}

export interface RoundRobinRound {
  matches: Array<[Id, Id]>;
  bye?: Id;
}

// Compatibility aliases (v2-only runtime; names kept to limit churn).
export type Config = ConfigV2;
export type Group = GroupV2;
export type Location = LocationV2;
export type ActivityType = ActivityTypeV2;
export type Station = StationV2;
export type Timeslot = TimeslotV2;
export type Allocation = PlanAllocationV2;
export type Plan = PlanV2;

export const LEGACY_FORMAT_ERROR =
  "Dit bestand gebruikt een oud formaat en kan niet meer worden ingelezen. Maak een nieuwe configuratie.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isTimeslotKind(value: unknown): value is TimeslotV2["kind"] {
  return value === "active" || value === "break";
}

function isMovementPolicy(value: unknown): value is ConfigV2["movementPolicy"] {
  return value === "free" || value === "blocks";
}

function isRepeatPolicy(value: unknown): value is ConstraintsV2["avoidRepeatActivityType"] {
  return value === "off" || value === "soft" || value === "hard";
}

function isScheduleMode(value: unknown): value is ScheduleMode {
  return value === "all-spellen" || value === "round-robin";
}

export function isConfigV2(value: unknown): value is ConfigV2 {
  if (!isRecord(value)) {
    return false;
  }
  const constraints = value.constraints;
  if (!isRecord(constraints)) {
    return false;
  }
  if (
    !isString(value.id) ||
    !isString(value.name) ||
    typeof value.segmentsEnabled !== "boolean" ||
    !Array.isArray(value.segments) ||
    !Array.isArray(value.groups) ||
    !Array.isArray(value.locations) ||
    !Array.isArray(value.activityTypes) ||
    !Array.isArray(value.stations) ||
    !Array.isArray(value.timeslots) ||
    !isMovementPolicy(value.movementPolicy) ||
    !isNumber(constraints.matchupMaxPerPair) ||
    typeof constraints.requireSameSegmentForMatches !== "boolean" ||
    !isRepeatPolicy(constraints.avoidRepeatActivityType)
  ) {
    return false;
  }

  if (
    !value.segments.every(
      (segment) => isRecord(segment) && isString(segment.id) && isString(segment.name)
    )
  ) {
    return false;
  }
  if (
    !value.groups.every(
      (group) =>
        isRecord(group) &&
        isString(group.id) &&
        isString(group.name) &&
        (group.segmentId === undefined || isString(group.segmentId))
    )
  ) {
    return false;
  }
  if (
    !value.locations.every(
      (location) => isRecord(location) && isString(location.id) && isString(location.name)
    )
  ) {
    return false;
  }
  if (
    !value.activityTypes.every(
      (type) => isRecord(type) && isString(type.id) && isString(type.name)
    )
  ) {
    return false;
  }
  if (
    !value.stations.every(
      (station) =>
        isRecord(station) &&
        isString(station.id) &&
        isString(station.name) &&
        isString(station.locationId) &&
        isString(station.activityTypeId) &&
        isNumber(station.capacityGroupsMin) &&
        isNumber(station.capacityGroupsMax)
    )
  ) {
    return false;
  }
  if (
    !value.timeslots.every(
      (timeslot) =>
        isRecord(timeslot) &&
        isString(timeslot.id) &&
        isString(timeslot.start) &&
        isString(timeslot.end) &&
        (timeslot.label === undefined || isString(timeslot.label)) &&
        isTimeslotKind(timeslot.kind) &&
        isNumber(timeslot.index)
    )
  ) {
    return false;
  }
  if (
    value.locationBlocks !== undefined &&
    (!Array.isArray(value.locationBlocks) ||
      !value.locationBlocks.every(
        (block) =>
          isRecord(block) &&
          isString(block.id) &&
          isString(block.name) &&
          hasStringArray(block.timeslotIds) &&
          isRecord(block.segmentLocationMap) &&
          Object.keys(block.segmentLocationMap).every((key) => isString(key)) &&
          Object.values(block.segmentLocationMap).every((locationId) => isString(locationId))
      ))
  ) {
    return false;
  }
  if (
    value.relaxedBlockTimeslotIds !== undefined &&
    !hasStringArray(value.relaxedBlockTimeslotIds)
  ) {
    return false;
  }
  if (
    !isRecord(value.scheduleSettings) ||
    !isNumber(value.scheduleSettings.roundDurationMinutes) ||
    !isNumber(value.scheduleSettings.transitionMinutes) ||
    !isScheduleMode(value.scheduleSettings.scheduleMode)
  ) {
    return false;
  }
  return true;
}

export function isPlanV2(value: unknown): value is PlanV2 {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !isString(value.id) ||
    !isString(value.configId) ||
    !Array.isArray(value.allocations) ||
    !isNumber(value.version) ||
    !isString(value.updatedAt)
  ) {
    return false;
  }
  if (
    !value.allocations.every(
      (allocation) =>
        isRecord(allocation) &&
        isString(allocation.id) &&
        isString(allocation.timeslotId) &&
        isString(allocation.stationId) &&
        hasStringArray(allocation.groupIds) &&
        (allocation.meta === undefined || isRecord(allocation.meta))
    )
  ) {
    return false;
  }
  return true;
}

export function assertConfigV2(value: unknown): ConfigV2 {
  if (!isConfigV2(value)) {
    // Geef een heldere fout als specifiek het verplichte scheduleMode-veld
    // ontbreekt — dit is een veelvoorkomend overgangsprobleem na de
    // generator-refactor (fase 1) en oude opgeslagen configs zullen hier op
    // stuk lopen totdat de DB is gereset.
    if (
      isRecord(value) &&
      (!isRecord((value as { scheduleSettings?: unknown }).scheduleSettings) ||
        !isScheduleMode(
          ((value as { scheduleSettings?: { scheduleMode?: unknown } })
            .scheduleSettings ?? {}).scheduleMode
        ))
    ) {
      throw new Error(
        "Configuratie ongeldig: scheduleSettings.scheduleMode is verplicht ('all-spellen' of 'round-robin'). Reset opgeslagen ontwikkeldata of vul het veld handmatig in."
      );
    }
    throw new Error(LEGACY_FORMAT_ERROR);
  }
  if (value.segmentsEnabled) {
    for (const group of value.groups) {
      if (!group.segmentId) {
        throw new Error("Configuratie ongeldig: elke groep moet een segmentId hebben.");
      }
    }
  }
  return value;
}

export function assertPlanV2(value: unknown): PlanV2 {
  if (!isPlanV2(value)) {
    throw new Error(LEGACY_FORMAT_ERROR);
  }
  return value;
}
