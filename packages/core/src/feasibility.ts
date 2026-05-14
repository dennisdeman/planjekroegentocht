import type { ConfigV2, Id, ScheduleMode } from "./model";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Wiskundige feasibility-rapportage per segment (pool of het impliciete
 * `__default__` segment als er geen pools zijn). Bevat alleen *ondergrenzen*
 * — wat strategieën daadwerkelijk halen wordt elders berekend
 * (`computePlanScore` op de gegenereerde plannen).
 */
export interface SegmentFeasibility {
  segmentId: Id;
  groupCount: number;
  /**
   * Aantal spelletjes dat een groep in dit segment speelt. v1-aanname:
   * gelijk aan het aantal actieve tijdsloten — d.w.z. we nemen aan dat elke
   * groep in elk actief slot speelt. Voor oneven pools is dat een
   * overschatting (sommige groepen krijgen pauze); we kiezen bewust voor
   * de pessimistische bovengrens, conform `docs/generator-fase-1-plan.md`
   * stap 1.1 ("voor v1 nemen we het maximum van de twee").
   */
  matchesPerGroup: number;
  /**
   * Aantal unieke spellen dat de groepen van dit segment over alle actieve
   * rondes en blokken samen kunnen bereiken, gegeven `locationBlocks` en
   * `relaxedBlockTimeslotIds`.
   */
  reachableActivityTypes: number;
  /**
   * Noodzakelijke maar niet voldoende ondergrens op het aantal
   * spel-herhalingen. Formule: `groupCount * max(0, matchesPerGroup -
   * reachableActivityTypes)`.
   *
   * **Let op:** deze waarde houdt geen rekening met match-structuur
   * constraints. Binnen een round-robin is niet elke groep-station
   * combinatie vrij toewijsbaar — de matches bepalen welke groepen samen
   * op een station belanden. Daardoor kan het werkelijke minimum hoger
   * liggen dan deze ondergrens. Voorbeeld: 16g/8s/split/blocks geeft
   * hier 0, maar brute-force laat zien dat het werkelijke minimum ~4
   * per pool is.
   *
   * Voor een preciezere ondergrens zou een match-structure-aware analyse
   * nodig zijn (Latin square / edge-coloring), wat buiten scope van v1
   * valt. Gebruik deze waarde als optimistische indicatie, niet als
   * harde belofte.
   */
  lowerBoundSpelRepeats: number;
  /**
   * Kleinste `matchupMaxPerPair` dat haalbaar is gegeven het aantal rondes
   * en de poolgrootte: `ceil(matchesPerGroup / (groupCount - 1))`. Bij
   * groupCount <= 1 is dit 0 (geen spelletjes mogelijk).
   */
  lowerBoundMatchupCeiling: number;
  /**
   * Werkt de algebraïsche constructie (zie `constructPerfectBlock` in
   * `generator.ts`) voor dit segment? Vereist: blocks-mode, even groupCount,
   * H = groupCount/2 met H >= 3 en H !== 6, een k ∈ [2,H-1] met
   * gcd(k,H)=1 en gcd(k-1,H)=1, plus per blok minstens H stations op de
   * locatie waar dit segment in dat blok zit.
   */
  algebraicFeasible: boolean;
  /**
   * Werkt de single-pool-rotation constructie voor dit segment? Vereist:
   * vrij verplaatsbeleid (geen blokken), even groupCount >= 4, all-spellen mode,
   * en minstens H = groupCount/2 non-pause stations. Levert 0 spel-herhalingen.
   *
   * Bewezen voor 4g t/m 16g via brute-force.
   */
  singlePoolFeasible: boolean;
  /**
   * Werkt de paired-rotation constructie voor dit segment? Vereist:
   * blocks-mode, even groupCount >= 6, H = groupCount/2, en per blok
   * exact H non-pause stations op de locatie waar dit segment in dat blok
   * zit. Complementair aan `algebraicFeasible` — dekt even-H waarden
   * die algebraic niet aankan (H=4, H=6, etc.). Levert partieel
   * round-robin op (44-60% van paren), maar 100% speldekking.
   *
   * Brute-force bewezen voor: 6g/3s, 8g/4s, 10g/5s.
   * Alleen `true` als `algebraicFeasible` false is (algebraic is strikt
   * beter wanneer dat werkt).
   */
  pairedRotationFeasible: boolean;
  /**
   * Heuristiek (v1) die suggereert of het toevoegen van een extra ronde met
   * pauze-activiteit het spel-repeat-minimum kan verlagen. Dit is
   * **geen** wiskundig bewijs — alleen een vlag dat het de moeite waard is
   * om in fase 2 te onderzoeken. Zie commentaar bij `computeByeAssistance`.
   */
  byeAssistancePossible: boolean;
}

export interface FeasibilityReport {
  mode: ScheduleMode;
  segments: SegmentFeasibility[];
  totalLowerBoundSpelRepeats: number;
  /**
   * Menselijk leesbare uitleg per segment dat een ondergrens > 0 heeft, of
   * een algemene "geen wiskundige obstructie gevonden" boodschap.
   */
  messages: string[];
}

// ---------------------------------------------------------------------------
// Algebraïsche helper — gedeeld met `strategies/algebraic.ts` (fase 1.4)
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Bestaat er een k ∈ [2, H-1] met gcd(k, H) = 1 én gcd(k-1, H) = 1?
 * Dit is de wiskundige voorwaarde voor de modulaire 0-repeat constructie
 * `constructPerfectBlock`. Geëxporteerd zodat de algebraic-strategie
 * (fase 1.4) en `analyzePlanFeasibility` exact dezelfde test gebruiken —
 * geen twee plekken met dezelfde regel.
 */
export function hasAlgebraicK(H: number): boolean {
  if (!Number.isInteger(H) || H < 3 || H === 6) return false;
  for (let k = 2; k < H; k += 1) {
    if (gcd(k, H) === 1 && gcd(k - 1, H) === 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Interne helpers — bewust gedupliceerd uit `advisor/feasibility.ts`.
// Die wordt in fase 3 verwijderd; we willen geen tijdelijke dependency.
// ---------------------------------------------------------------------------

const DEFAULT_SEGMENT_ID: Id = "__default__";

function sortedIds(ids: Id[]): Id[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function resolveSegmentIds(config: ConfigV2): Id[] {
  if (config.segmentsEnabled) {
    return sortedIds(config.segments.map((segment) => segment.id));
  }
  return [DEFAULT_SEGMENT_ID];
}

function groupIdsBySegment(config: ConfigV2): Map<Id, Id[]> {
  const out = new Map<Id, Id[]>();
  for (const segmentId of resolveSegmentIds(config)) {
    out.set(segmentId, []);
  }
  for (const group of config.groups) {
    const segmentId = config.segmentsEnabled
      ? group.segmentId ?? "__missing__"
      : DEFAULT_SEGMENT_ID;
    const list = out.get(segmentId) ?? [];
    list.push(group.id);
    out.set(segmentId, list);
  }
  return out;
}

function allLocationIds(config: ConfigV2): Id[] {
  return sortedIds(config.locations.map((location) => location.id));
}

/**
 * Welke locaties mag het segment in dit tijdsslot bezetten? In `free` mode
 * en in slots die in `relaxedBlockTimeslotIds` staan: alle locaties. In
 * `blocks` mode zonder daadwerkelijke `locationBlocks` (kan voorkomen bij
 * korte kroegentochten waar `buildConfig` geen blokken aanmaakt omdat er geen
 * pauze is) gedragen we ons effectief als `free` — er is geen
 * blok-constraint om af te dwingen. In `blocks` mode mét blokken: alleen
 * de locatie waar het segment in dit blok aan gekoppeld is.
 */
function allowedLocationIdsForSlot(
  config: ConfigV2,
  segmentId: Id,
  timeslotId: Id
): Id[] {
  if (config.relaxedBlockTimeslotIds?.includes(timeslotId)) {
    return allLocationIds(config);
  }
  if (config.movementPolicy === "free") {
    return allLocationIds(config);
  }
  const blocks = config.locationBlocks ?? [];
  if (blocks.length === 0) {
    return allLocationIds(config);
  }
  const block = blocks.find((entry) => entry.timeslotIds.includes(timeslotId));
  if (!block) return [];
  const locationId = block.segmentLocationMap[segmentId];
  if (!locationId) return [];
  return [locationId];
}

function activityTypesAtLocations(
  config: ConfigV2,
  locationIds: Id[]
): Set<Id> {
  const allowed = new Set(locationIds);
  const types = new Set<Id>();
  for (const station of config.stations) {
    if (allowed.has(station.locationId)) {
      types.add(station.activityTypeId);
    }
  }
  return types;
}

function stationCountAtLocation(config: ConfigV2, locationId: Id): number {
  let count = 0;
  for (const station of config.stations) {
    if (station.locationId === locationId) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Per-feasibility-veld berekeningen
// ---------------------------------------------------------------------------

/**
 * Voor v1 nemen we `matchesPerGroup` gelijk aan het aantal actieve
 * tijdsloten. Bij oneven pools is dat een (kleine) overschatting — sommige
 * groepen krijgen een rust-ronde — maar het is een veilige bovengrens
 * voor de wiskundige ondergrens van het aantal herhalingen. Zie
 * `docs/generator-fase-1-plan.md` stap 1.1.
 */
function computeMatchesPerGroup(activeTimeslotCount: number): number {
  return activeTimeslotCount;
}

function computeReachableActivityTypes(
  config: ConfigV2,
  segmentId: Id,
  activeTimeslotIds: Id[]
): number {
  const reachable = new Set<Id>();
  for (const timeslotId of activeTimeslotIds) {
    const locations = allowedLocationIdsForSlot(config, segmentId, timeslotId);
    for (const type of activityTypesAtLocations(config, locations)) {
      reachable.add(type);
    }
  }
  return reachable.size;
}

function computeAlgebraicFeasible(
  config: ConfigV2,
  segmentId: Id,
  groupCount: number
): boolean {
  if (config.movementPolicy !== "blocks") return false;
  const blocks = config.locationBlocks ?? [];
  if (blocks.length === 0) return false;
  if (groupCount < 6 || groupCount % 2 !== 0) return false;
  const H = groupCount / 2;
  if (!hasAlgebraicK(H)) return false;

  for (const block of blocks) {
    const locationId = block.segmentLocationMap[segmentId];
    if (!locationId) return false;
    if (stationCountAtLocation(config, locationId) < H) return false;
  }
  return true;
}

function computeSinglePoolFeasible(
  config: ConfigV2,
  groupCount: number
): boolean {
  if (config.scheduleSettings?.scheduleMode !== "all-spellen") return false;
  // Must be free movement (no blocks)
  if (config.movementPolicy === "blocks" && (config.locationBlocks ?? []).length > 0) return false;
  if (groupCount < 6 || groupCount % 2 !== 0) return false;
  const H = groupCount / 2;

  // Count non-pause stations across all locations
  let nonPauseStations = 0;
  for (const station of config.stations) {
    if (station.activityTypeId !== "activity-pause") nonPauseStations++;
  }
  if (nonPauseStations < H) return false;

  // Need enough active timeslots (at least H)
  const activeSlots = config.timeslots.filter((t) => t.kind === "active").length;
  if (activeSlots < H) return false;

  return true;
}

function computePairedRotationFeasible(
  config: ConfigV2,
  segmentId: Id,
  groupCount: number,
  algebraicFeasible: boolean
): boolean {
  if (algebraicFeasible) return false;
  if (config.scheduleSettings?.scheduleMode !== "all-spellen") return false;
  if (config.movementPolicy !== "blocks") return false;
  const blocks = config.locationBlocks ?? [];
  if (blocks.length === 0) return false;
  if (groupCount < 6 || groupCount % 2 !== 0) return false;
  const H = groupCount / 2;

  for (const block of blocks) {
    const locationId = block.segmentLocationMap[segmentId];
    if (!locationId) return false;
    const count = stationCountAtLocation(config, locationId);
    if (count < H) return false;
  }
  return true;
}

/**
 * Heuristiek die suggereert dat het toevoegen van een extra ronde met een
 * pauze-activiteit de spel-herhalingen *kan* verlagen.
 *
 * De heuristiek is bewust ruimer dan de oorspronkelijke v1-versie
 * (die `lowerBoundSpelRepeats > 0` vereiste). Reden: `lowerBoundSpelRepeats`
 * is een optimistische ondergrens die geen rekening houdt met
 * match-structuur constraints. Voor configs als 16g/8s/split/blocks
 * zegt de ondergrens 0 terwijl het werkelijke minimum ~4 per pool is.
 * Door de check te baseren op `!algebraicFeasible` in plaats van op de
 * ondergrens vangen we ook die gevallen op.
 *
 * Voorwaarden:
 *   - de algebraïsche constructie werkt niet (anders is 0 herhalingen
 *     al bereikbaar zonder bye-assistance);
 *   - de poolgrootte is even (oneven pools hebben al een ingebouwde bye);
 *   - `pauseActivity` is gedefinieerd op de config.
 *
 * Dit is NIET een wiskundig bewijs — alleen een indicatie dat
 * bye-assistance de moeite waard is om te onderzoeken.
 */
function computeByeAssistancePossible(
  config: ConfigV2,
  groupCount: number,
  algebraicFeasible: boolean
): boolean {
  if (algebraicFeasible) return false;
  if (groupCount % 2 !== 0) return false;
  return config.pauseActivity !== undefined;
}

// ---------------------------------------------------------------------------
// Mode-bepaling
// ---------------------------------------------------------------------------

/**
 * Leest de modus uit `config.scheduleSettings.scheduleMode`. Geen fallback:
 * oude configs zonder dit veld vallen al om op `assertConfigV2`. Hier
 * gooien we expliciet als de config buiten `assertConfigV2` om
 * geconstrueerd is en het veld toch ontbreekt — dat duidt op een bug in
 * de aanroeper, niet op data om defensief mee om te gaan.
 */
function readScheduleMode(config: ConfigV2): ScheduleMode {
  const mode = config.scheduleSettings?.scheduleMode;
  if (mode !== "all-spellen" && mode !== "round-robin") {
    throw new Error(
      "analyzePlanFeasibility: config.scheduleSettings.scheduleMode is verplicht. Construeer ConfigV2 via buildConfig of zet het veld expliciet."
    );
  }
  return mode;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzePlanFeasibility(config: ConfigV2): FeasibilityReport {
  const mode = readScheduleMode(config);

  const activeTimeslots = [...config.timeslots]
    .filter((slot) => slot.kind === "active")
    .sort((a, b) => a.index - b.index);
  const activeTimeslotIds = activeTimeslots.map((slot) => slot.id);
  const matchesPerGroup = computeMatchesPerGroup(activeTimeslots.length);

  const groupsBySegment = groupIdsBySegment(config);
  const segments: SegmentFeasibility[] = [];
  const messages: string[] = [];

  for (const segmentId of resolveSegmentIds(config)) {
    const groupIds = groupsBySegment.get(segmentId) ?? [];
    const groupCount = groupIds.length;
    if (groupCount === 0) continue;

    const reachableActivityTypes = computeReachableActivityTypes(
      config,
      segmentId,
      activeTimeslotIds
    );

    const perGroupRepeats = Math.max(0, matchesPerGroup - reachableActivityTypes);
    const lowerBoundSpelRepeats = perGroupRepeats * groupCount;

    const lowerBoundMatchupCeiling =
      groupCount > 1
        ? Math.ceil(matchesPerGroup / (groupCount - 1))
        : 0;

    const algebraicFeasible = computeAlgebraicFeasible(config, segmentId, groupCount);
    const singlePoolFeasible = computeSinglePoolFeasible(config, groupCount);
    const pairedRotationFeasible = computePairedRotationFeasible(
      config,
      segmentId,
      groupCount,
      algebraicFeasible
    );
    const byeAssistancePossible = computeByeAssistancePossible(
      config,
      groupCount,
      algebraicFeasible
    );

    segments.push({
      segmentId,
      groupCount,
      matchesPerGroup,
      reachableActivityTypes,
      lowerBoundSpelRepeats,
      lowerBoundMatchupCeiling,
      algebraicFeasible,
      singlePoolFeasible,
      pairedRotationFeasible,
      byeAssistancePossible,
    });

    if (lowerBoundSpelRepeats > 0) {
      const segmentLabel =
        segmentId === DEFAULT_SEGMENT_ID
          ? "Configuratie"
          : `Pool ${segmentNameOf(config, segmentId)}`;
      const byeHint = byeAssistancePossible
        ? " Een extra ronde met pauze-activiteit kan dit mogelijk verlagen (te verifiëren in fase 2)."
        : "";
      messages.push(
        `${segmentLabel}: elke groep speelt ${matchesPerGroup} spelletjes maar bereikt slechts ${reachableActivityTypes} unieke spellen. Minimaal ${perGroupRepeats} herhaling${perGroupRepeats === 1 ? "" : "en"} per groep (${lowerBoundSpelRepeats} totaal in dit segment). Mogelijke oplossingen: verlaag het aantal spelletjes per groep naar ${reachableActivityTypes}, voeg ${matchesPerGroup - reachableActivityTypes} spel${matchesPerGroup - reachableActivityTypes === 1 ? "" : "en"} toe, of herverdeel locaties zodat groepen meer unieke spellen bereiken.${byeHint}`
      );
    }
  }

  const totalLowerBoundSpelRepeats = segments.reduce(
    (sum, segment) => sum + segment.lowerBoundSpelRepeats,
    0
  );

  if (messages.length === 0) {
    messages.push(
      "Geen wiskundige obstructie gevonden: 0 spel-herhalingen is binnen deze configuratie haalbaar (mits een strategie het ook bereikt)."
    );
  }

  return {
    mode,
    segments,
    totalLowerBoundSpelRepeats,
    messages,
  };
}

function segmentNameOf(config: ConfigV2, segmentId: Id): string {
  const found = config.segments.find((segment) => segment.id === segmentId);
  return found?.name ?? segmentId;
}
