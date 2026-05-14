"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { assertConfigV2, findSpelByName, type ConfigV2, type Id, type LocationBlockV2, type ParticipantRow, type TimeslotV2 } from "@core";
import { splitGroupsAcrossSegments, BUILT_IN_PRESETS } from "@lib/planner/defaults";
import { usePlannerStore } from "@lib/planner/store";
import { AddSlotModal } from "@ui/add-slot-modal";
import { ConfigWizard } from "@ui/config-wizard";
import { UnsavedChangesGuard } from "@ui/unsaved-changes-guard";
import { MaterialsSection } from "@ui/materials-section";
import { CollapsibleSection } from "@ui/collapsible-section";
import { FileUpload } from "@ui/file-upload";
import { NotificationBar } from "@ui/ui/notification-bar";
import { usePlanState } from "@lib/use-plan-state";
import { UpgradeModal } from "@ui/upgrade-modal";
import { confirmDialog } from "@ui/ui/confirm-dialog";
import { TeamMembersEditor } from "@ui/team-members-editor";
import { VenueSearchModal } from "@ui/venue-search-modal";

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonArray<T>(raw: string, label: string): T[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} moet een array zijn.`);
  }
  return parsed as T[];
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimeFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "09:00";
  }
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

function setIsoTime(baseIso: string, hhmm: string): string {
  const [hoursRaw, minutesRaw] = hhmm.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const date = new Date(baseIso);
  if (Number.isNaN(date.getTime()) || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return baseIso;
  }
  date.setUTCHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function parseBreakIndexes(raw: string): Set<number> {
  return new Set(
    raw
      .split(/[;,\s]+/)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
}

function generateTimeslots(
  startHhmm: string,
  durationMinutes: number,
  transitionMinutes: number,
  rounds: number,
  breakIndexes: Set<number>
): TimeslotV2[] {
  const [hoursRaw, minutesRaw] = startHhmm.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const safeHours = Number.isFinite(hours) ? hours : 9;
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  const safeDuration = Math.max(5, Number.isFinite(durationMinutes) ? durationMinutes : 15);
  const safeTransition = Math.max(0, Number.isFinite(transitionMinutes) ? transitionMinutes : 0);
  const safeRounds = Math.max(1, Number.isFinite(rounds) ? rounds : 10);

  const base = new Date(Date.UTC(2026, 0, 1, safeHours, safeMinutes, 0, 0));
  const slots: TimeslotV2[] = [];
  let cursor = new Date(base);
  for (let i = 0; i < safeRounds; i += 1) {
    const index = i + 1;
    const start = new Date(cursor);
    const end = new Date(start.getTime() + safeDuration * 60_000);
    slots.push({
      id: `slot-${index}`,
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${formatTimeFromIso(start.toISOString())} - ${formatTimeFromIso(end.toISOString())}`,
      kind: breakIndexes.has(index) ? "break" : "active",
      index,
    });
    const hasNextSlot = index < safeRounds;
    const applyTransition = hasNextSlot;
    cursor = new Date(end.getTime() + (applyTransition ? safeTransition : 0) * 60_000);
  }
  return slots;
}

function nextNumericId(prefix: string, existingIds: Id[]): Id {
  const used = new Set(existingIds);
  let seq = existingIds.length + 1;
  while (used.has(`${prefix}-${seq}`)) {
    seq += 1;
  }
  return `${prefix}-${seq}`;
}

function sortedTimeslots(timeslots: TimeslotV2[]): TimeslotV2[] {
  return [...timeslots].sort((a, b) => a.index - b.index);
}

function findBlockRange(block: LocationBlockV2, orderedTimeslots: TimeslotV2[]): { startId: Id; endId: Id } {
  const indices = block.timeslotIds
    .map((slotId) => orderedTimeslots.findIndex((slot) => slot.id === slotId))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (indices.length === 0) {
    const fallback = orderedTimeslots[0]?.id ?? "";
    return { startId: fallback, endId: fallback };
  }
  return {
    startId: orderedTimeslots[indices[0]].id,
    endId: orderedTimeslots[indices[indices.length - 1]].id,
  };
}

function timeslotRange(startId: Id, endId: Id, orderedTimeslots: TimeslotV2[]): Id[] {
  const startIndex = orderedTimeslots.findIndex((slot) => slot.id === startId);
  const endIndex = orderedTimeslots.findIndex((slot) => slot.id === endId);
  if (startIndex === -1 || endIndex === -1) {
    return [];
  }
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  return orderedTimeslots.slice(from, to + 1).map((slot) => slot.id);
}

function reindexTimeslots(list: TimeslotV2[]): TimeslotV2[] {
  return sortedTimeslots(list).map((slot, idx) => ({ ...slot, index: idx + 1 }));
}

function remapLocationBlocksByTimeslotIndex(
  previousTimeslots: TimeslotV2[],
  nextTimeslots: TimeslotV2[],
  previousBlocks: LocationBlockV2[]
): LocationBlockV2[] {
  if (previousBlocks.length === 0 || nextTimeslots.length === 0) {
    return [];
  }

  const prevIndexById = new Map(previousTimeslots.map((slot) => [slot.id, slot.index]));
  const nextIdByIndex = new Map(nextTimeslots.map((slot) => [slot.index, slot.id]));
  const nextSlotById = new Map(nextTimeslots.map((slot) => [slot.id, slot]));

  const remapped = previousBlocks
    .map((block) => {
      const ids = Array.from(
        new Set(
          block.timeslotIds
            .map((id) => prevIndexById.get(id))
            .filter((value): value is number => typeof value === "number")
            .map((index) => nextIdByIndex.get(index))
            .filter((value): value is Id => typeof value === "string")
        )
      ).sort((a, b) => (nextSlotById.get(a)?.index ?? 0) - (nextSlotById.get(b)?.index ?? 0));
      return { ...block, timeslotIds: ids };
    })
    .filter((block) => block.timeslotIds.length > 0);

  return remapped;
}

type ImportType = "participants" | "groups";
type ImportMode = "rows-are-groups" | "fixed-size";
type StartMode = "empty" | "import" | "template";

const HELP_TEXT = {
  startManual: {
    title: "Leeg beginnen",
    body: "Vul groepen, velden en stations handmatig in via de secties hieronder.",
  },
  startCsv: {
    title: "Bestand importeren",
    body: "Upload een CSV- of Excel-bestand met deelnemers of groepen. Kolommen worden automatisch gedetecteerd.",
  },
  startPreset: {
    title: "Sjabloon laden",
    body: "Gebruik een eerder opgeslagen configuratie of het ingebouwde voorbeeld als startpunt voor een nieuwe kroegentocht.",
  },
  configName: {
    title: "Naam",
    body: "Dit is de naam van je kroegentocht-configuratie zoals die op dashboard en planner zichtbaar is.",
  },
  segmentsEnabled: {
    title: "Pools gebruiken",
    body: "Zet dit aan als groepen in segmenten/pools moeten spelen (bijv. Pool X en Pool Y).",
  },
  movementPolicy: {
    title: "Verplaatsbeleid",
    body: "`Vrij` laat elke pool overal spelen. `Blokken` houdt pools in vaste locaties per slotbereik.",
  },
  matchupMaxPerPair: {
    title: "Maximaal keer dezelfde tegenstander",
    body: "Bepaalt hoe vaak hetzelfde duo tegen elkaar mag uitkomen. Meestal is dit 1.",
  },
  repeatActivity: {
    title: "Herhaal hetzelfde spel",
    body: "Toestaan = geen check, Liever niet = waarschuwing, Verbieden = harde fout.",
  },
  importType: {
    title: "Importtype",
    body: "Kies `Deelnemers` voor individuele deelnemers of `Groepen + pools` als teams al bestaan.",
  },
  importHasHeader: {
    title: "Eerste rij bevat kolomnamen",
    body: "Aan als de eerste regel headers bevat zoals naam/klas/pool.",
  },
  importNameColumn: {
    title: "Naam/Groep-kolom",
    body: "Selecteer de kolom met de groeps- of deelnemersnaam.",
  },
  importPoolColumn: {
    title: "Pool-kolom",
    body: "Bij groepen-import verplicht: kolom met poolnaam of poolcode (X, Y, Z).",
  },
  importLevelColumn: {
    title: "Niveau-kolom",
    body: "Optioneel. Kan gebruikt worden om deelnemers evenwichtiger te verdelen.",
  },
  importMode: {
    title: "Groepeer-methode",
    body: "`1 rij = 1 groep` maakt elke rij direct een groep. `Vaste groepsgrootte` maakt automatische groepen.",
  },
  importFixedSize: {
    title: "Groepsgrootte",
    body: "Aantal deelnemers per automatisch aangemaakte groep.",
  },
  scheduleStart: {
    title: "Starttijd",
    body: "Het tijdstip waarop het eerste slot start.",
  },
  scheduleDuration: {
    title: "Duur per ronde",
    body: "Speelduur van één slot, exclusief wisseltijd.",
  },
  scheduleTransition: {
    title: "Wisseltijd tussen rondes",
    body: "Tijd tussen het einde van slot N en de start van slot N+1.",
  },
  scheduleRounds: {
    title: "Aantal rondes",
    body: "Hoeveel tijdslots er worden aangemaakt.",
  },
  scheduleBreakSlots: {
    title: "Pauze slot(s)",
    body: "Geef slotnummers op die als pauze/wisselblok moeten worden gemarkeerd, bijvoorbeeld `5` of `5,8`.",
  },
} as const;

type HelpKey = keyof typeof HELP_TEXT;

function LabelWithHelp(props: {
  text: string;
  helpKey?: HelpKey;
  onOpenHelp: (key: HelpKey) => void;
}) {
  return (
    <span className="label-with-help">
      {props.text}
      {props.helpKey ? (
        <button
          type="button"
          className="help-icon-button"
          onClick={() => props.onOpenHelp(props.helpKey!)}
          aria-label={`Uitleg over ${props.text}`}
        >
          ?
        </button>
      ) : null}
    </span>
  );
}

function HelpModal(props: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={props.onClose}>
      <div className="help-modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="help-modal-header">
          <h3>{props.title}</h3>
          <button type="button" className="ghost-button" onClick={props.onClose}>
            Sluiten
          </button>
        </header>
        <p>{props.body}</p>
      </div>
    </div>
  );
}

interface ImportPreview {
  delimiter: "," | ";" | "\t";
  headers: string[];
  rows: string[][];
  warnings: string[];
}

interface ConfigTemplate {
  id: string;
  name: string;
  payload: unknown;
  created_at: string;
}

function detectDelimiter(raw: string): "," | ";" | "\t" {
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  const sampleLines = raw.split(/\r?\n/).slice(0, 5);
  const scores = candidates.map((delimiter) => ({
    delimiter,
    score: sampleLines.reduce((sum, line) => sum + line.split(delimiter).length, 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0].delimiter;
}

function parseCsvLine(line: string, delimiter: "," | ";" | "\t"): string[] {
  const output: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      output.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  output.push(current.trim());
  return output;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, "");
}

function slugForId(input: string, fallback: string): string {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function uniqueSlug(base: string, used: Set<string>, fallback: string): string {
  const start = slugForId(base, fallback);
  let current = start;
  let index = 2;
  while (used.has(current)) {
    current = `${start}-${index}`;
    index += 1;
  }
  used.add(current);
  return current;
}

function autoDetectHeaderIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function analyzeImportCsv(raw: string, hasHeader: boolean): ImportPreview {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return {
      delimiter: ",",
      headers: [],
      rows: [],
      warnings: ["Input is leeg."],
    };
  }

  const delimiter = detectDelimiter(lines.join("\n"));
  const matrix = lines.map((line) => parseCsvLine(line, delimiter));
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const normalizedRows = matrix.map((row) => {
    if (row.length >= width) {
      return row;
    }
    return [...row, ...Array.from({ length: width - row.length }, () => "")];
  });

  const headers = hasHeader
    ? normalizedRows[0].map((value, index) => value || `kolom-${index + 1}`)
    : Array.from({ length: width }, (_, index) => `Kolom ${index + 1}`);
  const rows = hasHeader ? normalizedRows.slice(1) : normalizedRows;
  const warnings: string[] = [];
  if (rows.length === 0) {
    warnings.push("Geen datarijen gevonden.");
  }

  return {
    delimiter,
    headers,
    rows,
    warnings,
  };
}

export default function ConfiguratorPage() {
  return (
    <Suspense>
      <ConfiguratorContent />
    </Suspense>
  );
}

function ConfiguratorContent() {
  const router = useRouter();
  const [configId, setConfigId] = useState<string | null>(null);
  const [segmentsRaw, setSegmentsRaw] = useState("");
  const [groupsRaw, setGroupsRaw] = useState("");
  const [locationsRaw, setLocationsRaw] = useState("");
  const [activityTypesRaw, setActivityTypesRaw] = useState("");
  const [stationsRaw, setStationsRaw] = useState("");
  const [timeslotsRaw, setTimeslotsRaw] = useState("");
  const [blocksRaw, setBlocksRaw] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedTouched, setAdvancedTouched] = useState(false);
  const [activeHelp, setActiveHelp] = useState<HelpKey | null>(null);
  const [csvInput, setCsvInput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<StartMode>("empty");
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [importHasHeader, setImportHasHeader] = useState(true);
  const [importType, setImportType] = useState<ImportType>("participants");
  const [importMode, setImportMode] = useState<ImportMode>("rows-are-groups");
  const [importFixedSize, setImportFixedSize] = useState(2);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importNameColumn, setImportNameColumn] = useState("0");
  const [importClassColumn, setImportClassColumn] = useState("");
  const [importLevelColumn, setImportLevelColumn] = useState("");

  const [editingMembersGroupId, setEditingMembersGroupId] = useState<string | null>(null);
  const [groupMemberCounts, setGroupMemberCounts] = useState<Record<string, number>>({});
  const [showVenueSearch, setShowVenueSearch] = useState(false);

  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleDuration, setScheduleDuration] = useState(15);
  const [scheduleTransition, setScheduleTransition] = useState(0);
  const [scheduleRounds, setScheduleRounds] = useState(10);
  const [scheduleBreakSlots, setScheduleBreakSlots] = useState("5");
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [confirmLoadPreset, setConfirmLoadPreset] = useState<string | false>(false);
  const [startDismissed, setStartDismissed] = useState(false);
  const [showImportInline, setShowImportInline] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const planState = usePlanState();
  const isFrozen = planState.status === "frozen" || planState.status === "expired";
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  // Advies-systeem state
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [advisorResult, setAdvisorResult] = useState<any>(null);

  const {
    init,
    loadConfig,
    activeConfig,
    participantImportCount,
    participantImportWarnings,
    uiMessage,
    updateConfig,
    newConfig,
    importParticipantRows,
    usePreset,
    generatePlan,
    saveCurrent,
    clearMessage,
    showMessage,
    configRecords,
    refreshDashboard,
    deleteConfigRecord,
    dirty,
  } = usePlannerStore();

  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const urlConfigId = searchParams.get("configId");

  useEffect(() => {
    void init();
    void refreshDashboard();
  }, [init, refreshDashboard]);

  // Reageer op URL-parameters (reactief bij elke navigatie)
  const lastAppliedMode = useRef<string | null>(null);
  useEffect(() => {
    const key = `${urlMode}:${urlConfigId}`;
    if (key === lastAppliedMode.current) return;
    lastAppliedMode.current = key;

    if (urlConfigId) setConfigId(urlConfigId);
    if (urlMode === "wizard") { setShowWizard(true); }
    else if (urlMode === "template") { setStartMode("template"); void loadTemplates(); }
    else if (urlMode === "import") { setStartMode("import"); }
    else if (urlMode === "empty") { newConfig(); setStartDismissed(true); }
  }, [urlMode, urlConfigId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (configId) {
      void loadConfig(configId);
    }
  }, [configId, loadConfig]);

  // Refresh member-count badges whenever the active config or modal changes.
  useEffect(() => {
    const activeId = activeConfig.id;
    if (!activeId) {
      setGroupMemberCounts({});
      return;
    }
    if (editingMembersGroupId) return; // modal manages its own count via onCountChange
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/team-members/assignments?configId=${encodeURIComponent(activeId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { assignments: { memberId: string; groupId: string }[] };
        if (cancelled) return;
        const counts: Record<string, number> = {};
        for (const a of data.assignments) counts[a.groupId] = (counts[a.groupId] ?? 0) + 1;
        setGroupMemberCounts(counts);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [activeConfig.id, editingMembersGroupId]);

  useEffect(() => {
    setSegmentsRaw(pretty(activeConfig.segments));
    setGroupsRaw(pretty(activeConfig.groups));
    setLocationsRaw(pretty(activeConfig.locations));
    setActivityTypesRaw(pretty(activeConfig.activityTypes));
    setStationsRaw(pretty(activeConfig.stations));
    setTimeslotsRaw(pretty(activeConfig.timeslots));
    setBlocksRaw(pretty(activeConfig.locationBlocks ?? []));

    const ordered = sortedTimeslots(activeConfig.timeslots);
    if (ordered.length > 0) {
      setScheduleStart(formatTimeFromIso(ordered[0].start));
      const durationFromSlot = Math.round(
        (new Date(ordered[0].end).getTime() - new Date(ordered[0].start).getTime()) / 60_000
      );
      if (Number.isFinite(durationFromSlot) && durationFromSlot > 0) {
        setScheduleDuration(durationFromSlot);
      }
      const transitionFromConfig = activeConfig.scheduleSettings?.transitionMinutes;
      if (typeof transitionFromConfig === "number" && Number.isFinite(transitionFromConfig)) {
        setScheduleTransition(Math.max(0, transitionFromConfig));
      } else if (ordered.length > 1) {
        const gap = Math.round(
          (new Date(ordered[1].start).getTime() - new Date(ordered[0].end).getTime()) / 60_000
        );
        setScheduleTransition(Math.max(0, Number.isFinite(gap) ? gap : 0));
      } else {
        setScheduleTransition(0);
      }
      setScheduleRounds(ordered.length);
      const breakIndexes = ordered
        .filter((slot) => slot.kind === "break")
        .map((slot) => slot.index)
        .sort((a, b) => a - b)
        .join(",");
      setScheduleBreakSlots(breakIndexes);
    }
  }, [activeConfig]);

  const summary = useMemo(
    () => ({
      segments: activeConfig.segments.length,
      groups: activeConfig.groups.length,
      locations: activeConfig.locations.length,
      activityTypes: activeConfig.activityTypes.length,
      stations: activeConfig.stations.length,
      timeslots: activeConfig.timeslots.length,
    }),
    [activeConfig]
  );

  const missingCoreItems =
    summary.groups === 0 ||
    summary.locations === 0 ||
    summary.activityTypes === 0 ||
    summary.stations === 0;

  const hasAnyData =
    summary.groups > 0 ||
    summary.locations > 0 ||
    summary.activityTypes > 0 ||
    summary.stations > 0 ||
    summary.timeslots > 0;

  // Listen for re-click on "Configurator" nav link — gewoon huidige config tonen
  useEffect(() => {
    function handleReclick(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail !== "/configurator") return;
      // Niets doen — gebruiker is al op de configurator met de huidige config
    }
    window.addEventListener("nav-reclick", handleReclick);
    return () => window.removeEventListener("nav-reclick", handleReclick);
  }, []);

  // Reset startscherm als een nieuwe lege config wordt geladen
  useEffect(() => {
    if (!hasAnyData) {
      setStartDismissed(false);
    }
  }, [activeConfig.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedTimeslots = useMemo(
    () => sortedTimeslots(activeConfig.timeslots),
    [activeConfig.timeslots]
  );

  useEffect(() => {
    if (advancedTouched) {
      return;
    }
    const hasSomeConfiguredData =
      summary.groups +
        summary.locations +
        summary.activityTypes +
        summary.stations +
        summary.segments +
        summary.timeslots >
      0;
    if (missingCoreItems && hasSomeConfiguredData) {
      setAdvancedOpen(true);
    }
  }, [advancedTouched, missingCoreItems, summary]);

  const applyJsonSections = () => {
    try {
      const nextConfig: Partial<ConfigV2> = {
        segments: parseJsonArray(segmentsRaw, "segments"),
        groups: parseJsonArray(groupsRaw, "groups"),
        locations: parseJsonArray(locationsRaw, "locations"),
        activityTypes: parseJsonArray(activityTypesRaw, "activityTypes"),
        stations: parseJsonArray(stationsRaw, "stations"),
        timeslots: parseJsonArray(timeslotsRaw, "timeslots"),
        locationBlocks: parseJsonArray(blocksRaw, "locationBlocks"),
      };
      updateConfig(nextConfig);
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "JSON kon niet worden verwerkt.");
    }
  };

  const updateSegments = (segments: ConfigV2["segments"]) => {
    const segmentIds = new Set(segments.map((segment) => segment.id));
    const fallbackSegmentId = segments[0]?.id;
    const groups = activeConfig.groups.map((group) => {
      if (!activeConfig.segmentsEnabled) {
        return { ...group, segmentId: group.segmentId };
      }
      if (group.segmentId && segmentIds.has(group.segmentId)) {
        return group;
      }
      return { ...group, segmentId: fallbackSegmentId };
    });
    updateConfig({ segments, groups });
  };

  const updateGroups = (groups: ConfigV2["groups"]) => {
    if (!activeConfig.segmentsEnabled) {
      updateConfig({ groups: groups.map((group) => ({ ...group, segmentId: group.segmentId })) });
      return;
    }
    const fallbackSegment = activeConfig.segments[0]?.id;
    updateConfig({
      groups: groups.map((group) => ({
        ...group,
        segmentId: group.segmentId ?? fallbackSegment,
      })),
    });
  };

  const addStationForLocation = (locationId: Id) => {
    if (activeConfig.activityTypes.length === 0) {
      showMessage("Voeg eerst minimaal 1 spel toe.");
      return;
    }
    const nextId = nextNumericId(
      "station",
      activeConfig.stations.map((station) => station.id)
    );
    updateConfig({
      stations: [
        ...activeConfig.stations,
        {
          id: nextId,
          name: `Station ${activeConfig.stations.length + 1}`,
          locationId,
          activityTypeId: activeConfig.activityTypes[0].id,
          capacityGroupsMin: 2,
          capacityGroupsMax: 2,
        },
      ],
    });
  };

  const createTimeslotPlan = () => {
    const slots = generateTimeslots(
      scheduleStart,
      Number(scheduleDuration),
      Number(scheduleTransition),
      Number(scheduleRounds),
      parseBreakIndexes(scheduleBreakSlots)
    );
    const previousBlocks = activeConfig.locationBlocks ?? [];
    const remappedBlocks = remapLocationBlocksByTimeslotIndex(
      activeConfig.timeslots,
      slots,
      previousBlocks
    );
    // Bij het opnieuw genereren van slots: verwijder pauze-activiteit en bijbehorende stations/activity types
    // om inconsistenties met de generator te voorkomen.
    const cleanedStations = activeConfig.stations.filter((s) => s.activityTypeId !== "activity-pause");
    const cleanedActivityTypes = activeConfig.activityTypes.filter((a) => a.id !== "activity-pause");

    updateConfig({
      timeslots: slots,
      locationBlocks: remappedBlocks,
      stations: cleanedStations,
      activityTypes: cleanedActivityTypes,
      pauseActivity: undefined,
      scheduleSettings: {
        roundDurationMinutes: Math.max(5, Number(scheduleDuration) || 5),
        transitionMinutes: Math.max(0, Number(scheduleTransition) || 0),
        scheduleMode: activeConfig.scheduleSettings.scheduleMode,
      },
    });
  };

  const updateBlockRange = (blockId: Id, startId: Id, endId: Id) => {
    const blocks = activeConfig.locationBlocks ?? [];
    const next = blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            timeslotIds: timeslotRange(startId, endId, orderedTimeslots),
          }
        : block
    );
    updateConfig({ locationBlocks: next });
  };

  const addBlock = () => {
    if (orderedTimeslots.length === 0) {
      showMessage("Maak eerst tijdslots aan.");
      return;
    }
    const nextId = nextNumericId(
      "block",
      (activeConfig.locationBlocks ?? []).map((block) => block.id)
    );
    const defaultMapping = Object.fromEntries(
      activeConfig.segments.map((segment, index) => [
        segment.id,
        activeConfig.locations[index % Math.max(activeConfig.locations.length, 1)]?.id ?? "",
      ])
    );
    updateConfig({
      locationBlocks: [
        ...(activeConfig.locationBlocks ?? []),
        {
          id: nextId,
          name: `Blok ${(activeConfig.locationBlocks ?? []).length + 1}`,
          timeslotIds: [orderedTimeslots[0].id],
          segmentLocationMap: defaultMapping,
        },
      ],
    });
  };

  const applySwapBlocksPreset = () => {
    if (activeConfig.segments.length < 2 || activeConfig.locations.length < 2) {
      showMessage("Auto-wissel vereist minimaal 2 pools en 2 velden.");
      return;
    }
    const sorted = orderedTimeslots;
    const breakSlot = sorted.find((slot) => slot.kind === "break");
    if (!breakSlot) {
      showMessage("Geen pauzeslot gevonden. Markeer eerst een slot als pauze.");
      return;
    }
    const before = sorted.filter((slot) => slot.kind === "active" && slot.index < breakSlot.index);
    const after = sorted.filter((slot) => slot.kind === "active" && slot.index > breakSlot.index);
    if (before.length === 0 || after.length === 0) {
      showMessage("Auto-wissel verwacht actieve slots voor en na de pauze.");
      return;
    }

    const segA = activeConfig.segments[0].id;
    const segB = activeConfig.segments[1].id;
    const locA = activeConfig.locations[0].id;
    const locB = activeConfig.locations[1].id;

    updateConfig({
      movementPolicy: "blocks",
      locationBlocks: [
        {
          id: "block-1",
          name: "Blok 1",
          timeslotIds: before.map((slot) => slot.id),
          segmentLocationMap: {
            [segA]: locA,
            [segB]: locB,
          },
        },
        {
          id: "block-2",
          name: "Blok 2",
          timeslotIds: after.map((slot) => slot.id),
          segmentLocationMap: {
            [segA]: locB,
            [segB]: locA,
          },
        },
      ],
    });
  };

  // ── Template functions ──────────────────────────────────────────────
  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/org/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch {
      // ignore
    } finally {
      setTemplatesLoading(false);
    }
  };

  const saveAsTemplate = async () => {
    const name = templateName.trim() || activeConfig.name;
    try {
      const res = await fetch("/api/org/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, payload: activeConfig }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error ?? "Opslaan mislukt.", "error");
        return;
      }
      setTemplateName("");
      showMessage(`Sjabloon "${name}" opgeslagen.`, "success");
      await loadTemplates();
    } catch {
      showMessage("Opslaan mislukt.", "error");
    }
  };

  const loadTemplate = (template: ConfigTemplate) => {
    try {
      const config = assertConfigV2(template.payload);
      // Give it a new ID so it doesn't overwrite the original config
      const fresh = { ...config, id: `cfg-${Date.now()}` };
      updateConfig(fresh);
      showMessage(`Sjabloon "${template.name}" geladen.`, "success");
    } catch {
      showMessage("Sjabloon kon niet worden geladen — ongeldig formaat.", "error");
    }
  };

  const deleteTemplate = async (templateId: string) => {
    try {
      const res = await fetch("/api/org/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (res.ok) {
        showMessage("Sjabloon verwijderd.", "success");
        await loadTemplates();
      }
    } catch {
      showMessage("Verwijderen mislukt.", "error");
    }
  };

  // ── Import functions ──────────────────────────────────────────────
  const analyzeImport = () => {
    const preview = analyzeImportCsv(csvInput, importHasHeader);
    setImportPreview(preview);
    const nameIndex = autoDetectHeaderIndex(
      preview.headers,
      importType === "groups" ? ["groep", "group", "team", "naam", "name"] : ["naam", "name", "student", "team"]
    );
    const classIndex = autoDetectHeaderIndex(
      preview.headers,
      importType === "groups"
        ? ["pool", "segment", "poule", "klas", "class"]
        : ["klas", "class", "afdeling", "department"]
    );
    const levelIndex =
      importType === "groups" ? -1 : autoDetectHeaderIndex(preview.headers, ["niveau", "level"]);
    setImportNameColumn(String(nameIndex >= 0 ? nameIndex : 0));
    setImportClassColumn(classIndex >= 0 ? String(classIndex) : "");
    setImportLevelColumn(levelIndex >= 0 ? String(levelIndex) : "");
  };

  const commitImport = () => {
    if (!importPreview) {
      showMessage("Analyseer eerst de CSV.");
      return;
    }
    const nameIndex = Number(importNameColumn);
    if (!Number.isInteger(nameIndex) || nameIndex < 0) {
      showMessage("Kies een geldige naam-kolom.");
      return;
    }

    const classIndex = importClassColumn === "" ? -1 : Number(importClassColumn);
    const levelIndex = importLevelColumn === "" ? -1 : Number(importLevelColumn);
    const warnings = [...importPreview.warnings];
    const rows: ParticipantRow[] = [];

    if (importType === "groups" && classIndex < 0) {
      showMessage("Voor groepen-import is een pool-kolom verplicht.");
      return;
    }

    for (let i = 0; i < importPreview.rows.length; i += 1) {
      const source = importPreview.rows[i];
      const groupName = (source[nameIndex] ?? "").trim();
      if (!groupName) {
        if (importType === "groups") {
          showMessage(`Rij ${i + 1} is ongeldig: groepnaam ontbreekt.`);
          return;
        }
        warnings.push(`Rij ${i + 1} overgeslagen: naam ontbreekt.`);
        continue;
      }

      if (importType === "groups") {
        const poolRaw = (source[classIndex] ?? "").trim();
        if (!poolRaw) {
          showMessage(`Rij ${i + 1} is ongeldig: pool ontbreekt.`);
          return;
        }
        const poolLabel = /^pool\s+/i.test(poolRaw) ? poolRaw : `Pool ${poolRaw}`;
        rows.push({
          id: `participant-${rows.length + 1}`,
          name: groupName,
          className: poolLabel,
        });
        continue;
      }

      rows.push({
        id: `participant-${rows.length + 1}`,
        name: groupName,
        className: classIndex >= 0 ? source[classIndex]?.trim() || undefined : undefined,
        level: levelIndex >= 0 ? source[levelIndex]?.trim() || undefined : undefined,
      });
    }

    if (rows.length === 0) {
      showMessage("Geen geldige rijen gevonden om te importeren.");
      return;
    }

    importParticipantRows(rows, warnings, {
      fixedSize: importType === "groups" ? 1 : importMode === "rows-are-groups" ? 1 : Math.max(1, importFixedSize),
      mixByLevel: importType === "participants" ? Boolean(levelIndex >= 0) : false,
    });
    showMessage(
      importType === "groups"
        ? `Groepen-import voltooid: ${rows.length} groepen met pools verwerkt.`
        : `Deelnemers-import voltooid: ${rows.length} rijen verwerkt.`
    );
  };

  const importSection =
    startMode !== "import" ? null : (
      <section className="card">
        <div className="wizard-header">
          <h3>Bestand importeren</h3>
          {participantImportCount > 0 && (
            <span className="section-badge section-badge-done">{participantImportCount} gevonden</span>
          )}
        </div>
        <FileUpload
          onFileLoaded={(csvText) => {
            setCsvInput(csvText);
          }}
        />
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ cursor: "pointer", fontSize: "0.85rem" }}>Of plak data handmatig</summary>
          <label style={{ marginTop: 6 }}>
            <textarea
              value={csvInput}
              onChange={(event) => setCsvInput(event.target.value)}
              placeholder={
                importType === "groups"
                  ? "groep;pool\nGroep 5A;Pool X"
                  : "naam;klas;niveau\nAnna;1A;hoog"
              }
            />
          </label>
        </details>
        <div className="inline-actions" style={{ marginTop: 8 }}>
          <label>
            <LabelWithHelp text="Importtype" helpKey="importType" onOpenHelp={setActiveHelp} />
            <select value={importType} onChange={(event) => setImportType(event.target.value as ImportType)}>
              <option value="participants">Deelnemers</option>
              <option value="groups">Groepen + pools</option>
            </select>
          </label>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={importHasHeader}
              onChange={(event) => setImportHasHeader(event.target.checked)}
            />
            <LabelWithHelp
              text="Eerste rij bevat kolomnamen"
              helpKey="importHasHeader"
              onOpenHelp={setActiveHelp}
            />
          </label>
          <button type="button" className="btn-secondary" onClick={analyzeImport}>
            Analyseer
          </button>
          <button type="button" className="btn-primary" onClick={commitImport} disabled={!importPreview}>
            Verwerk import
          </button>
        </div>

        {importPreview ? (
          <div className="import-wizard">
            <div className="import-config-grid">
              <label>
                <LabelWithHelp
                  text={importType === "groups" ? "Groep-kolom" : "Naam-kolom"}
                  helpKey="importNameColumn"
                  onOpenHelp={setActiveHelp}
                />
                <select value={importNameColumn} onChange={(event) => setImportNameColumn(event.target.value)}>
                  {importPreview.headers.map((header, index) => (
                    <option key={`${header}-${index}`} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <LabelWithHelp
                  text={importType === "groups" ? "Pool-kolom (verplicht)" : "Klas-kolom (optioneel)"}
                  helpKey="importPoolColumn"
                  onOpenHelp={setActiveHelp}
                />
                <select value={importClassColumn} onChange={(event) => setImportClassColumn(event.target.value)}>
                  {importType === "participants" ? <option value="">Geen</option> : null}
                  {importPreview.headers.map((header, index) => (
                    <option key={`class-${header}-${index}`} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
              {importType === "participants" ? (
                <label>
                  <LabelWithHelp text="Niveau-kolom (optioneel)" helpKey="importLevelColumn" onOpenHelp={setActiveHelp} />
                  <select value={importLevelColumn} onChange={(event) => setImportLevelColumn(event.target.value)}>
                    <option value="">Geen</option>
                    {importPreview.headers.map((header, index) => (
                      <option key={`level-${header}-${index}`} value={index}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {importType === "participants" ? (
                <label>
                  <LabelWithHelp text="Groepeer-methode" helpKey="importMode" onOpenHelp={setActiveHelp} />
                  <select
                    value={importMode}
                    onChange={(event) => setImportMode(event.target.value as ImportMode)}
                  >
                    <option value="rows-are-groups">1 rij = 1 groep</option>
                    <option value="fixed-size">Automatisch op vaste groepsgrootte</option>
                  </select>
                </label>
              ) : null}
              {importType === "participants" && importMode === "fixed-size" ? (
                <label>
                  <LabelWithHelp text="Groepsgrootte" helpKey="importFixedSize" onOpenHelp={setActiveHelp} />
                  <input
                    type="number"
                    min={1}
                    value={importFixedSize}
                    onChange={(event) => setImportFixedSize(Number(event.target.value) || 2)}
                  />
                </label>
              ) : null}
            </div>

            <div className="table-wrap">
              <table className="simple-table import-preview-table">
                <thead>
                  <tr>
                    {importPreview.headers.map((header, index) => (
                      <th key={`${header}-${index}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 10).map((row, rowIndex) => (
                    <tr key={`preview-row-${rowIndex}`}>
                      {importPreview.headers.map((_, colIndex) => (
                        <td key={`preview-cell-${rowIndex}-${colIndex}`}>{row[colIndex] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Preview toont eerste {Math.min(importPreview.rows.length, 10)} van {importPreview.rows.length} rijen.
              Delimiter: <code>{importPreview.delimiter === "\t" ? "tab" : importPreview.delimiter}</code>
            </p>
          </div>
        ) : null}

        {participantImportWarnings.length > 0 ? (
          <ul className="warnings-list">
            {participantImportWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </section>
    );

  return (
    <div className="configurator">
      <UnsavedChangesGuard />
      {showWizard && (
        <ConfigWizard
          onComplete={(config) => {
            updateConfig(config);
            setShowWizard(false);
            setStartDismissed(true);
            showMessage(`Configuratie "${config.name}" aangemaakt via wizard.`, "success");
          }}
          onCancel={() => setShowWizard(false)}
        />
      )}
      {uiMessage ? <NotificationBar message={uiMessage.text} type={uiMessage.type} onClose={() => clearMessage()} /> : null}

      {confirmClose && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmClose(false); }}>
          <div className="help-modal-card" style={{ width: "min(420px, 100%)" }}>
            <h3 style={{ margin: "0 0 8px" }}>Configuratie sluiten</h3>
            <p>Je hebt niet-opgeslagen wijzigingen. Wil je eerst opslaan?</p>
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn-primary" onClick={async () => {
                await saveCurrent();
                showMessage("Configuratie opgeslagen.", "success");
                newConfig();
                setConfirmClose(false);
                setStartDismissed(false);
                setStartMode("empty");
                setShowImportInline(false);
              }}>
                Opslaan en sluiten
              </button>
              <button type="button" className="btn-secondary" onClick={() => {
                newConfig();
                setConfirmClose(false);
                setStartDismissed(false);
                setStartMode("empty");
                setShowImportInline(false);
              }}>
                Sluiten zonder opslaan
              </button>
              <button type="button" className="btn-ghost" onClick={() => setConfirmClose(false)}>
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {upgradeMessage && <UpgradeModal message={upgradeMessage} onClose={() => setUpgradeMessage(null)} />}

      {editingMembersGroupId && activeConfig.id && (() => {
        const group = activeConfig.groups.find((g) => g.id === editingMembersGroupId);
        if (!group) return null;
        return (
          <TeamMembersEditor
            configId={activeConfig.id}
            groupId={group.id}
            groupName={group.name}
            onClose={() => setEditingMembersGroupId(null)}
          />
        );
      })()}

      {showVenueSearch && (
        <VenueSearchModal
          onClose={() => setShowVenueSearch(false)}
          existingSourceIds={activeConfig.locations
            .map((l) => l.sourceId)
            .filter((id): id is string => Boolean(id))}
          onAdd={(venues) => {
            const existingIds = activeConfig.locations.map((l) => l.id);
            const nextLocations = [...activeConfig.locations];
            for (const v of venues) {
              const id = nextNumericId("locatie", [...existingIds, ...nextLocations.map((l) => l.id)]);
              nextLocations.push({ id, ...v });
            }
            updateConfig({ locations: nextLocations });
          }}
        />
      )}

      {/* Advies-modal bij generatie-fout */}
      {advisorOpen && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { setAdvisorOpen(false); } }}>
          <div className="help-modal-card" style={{ width: "min(600px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
            <div className="help-modal-header">
              <h3>Advies: configuratie aanpassen</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAdvisorOpen(false)}>Sluiten</button>
            </div>

            {uiMessage && (
              <div className="notice notice-warning" style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>{uiMessage.text}</p>
              </div>
            )}

            {advisorBusy && (
              <p className="muted">Advies wordt opgehaald...</p>
            )}

            {advisorError && (
              <div className="notice notice-warning" style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>{advisorError}</p>
              </div>
            )}

            {advisorResult && (
              <div style={{ display: "grid", gap: 12 }}>
                {advisorResult.samenvatting && (
                  <p style={{ margin: 0, fontSize: "0.9rem" }}>{advisorResult.samenvatting}</p>
                )}
                {advisorResult.probleem && (
                  <div className="notice notice-warning">
                    <p style={{ margin: 0 }}>{advisorResult.probleem}</p>
                  </div>
                )}
                {advisorResult.scenarios?.length > 0 && (
                  <>
                    <h4 style={{ margin: 0 }}>Aanbevolen aanpassingen</h4>
                    {advisorResult.scenarios.map((scenario: { titel: string; beschrijving: string; config?: { groupCount?: number; spellen?: string[]; groupsPerPool?: number[]; movementPolicy?: string; stationLayout?: string; poolNames?: string[] } }, i: number) => (
                      <div key={i} className="card" style={{ padding: 12 }}>
                        <h4 style={{ margin: "0 0 4px" }}>{scenario.titel}</h4>
                        <p className="muted" style={{ margin: "0 0 8px", fontSize: "0.85rem" }}>{scenario.beschrijving}</p>
                        {scenario.config && (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => {
                              // Pas de configuratie aan op basis van het advies
                              const sc = scenario.config!;
                              const patch: Partial<ConfigV2> = {};

                              // Spellen aanpassen
                              if (sc.spellen?.length) {
                                const newActivities = sc.spellen.map((s, idx) => ({ id: `activity-${idx + 1}`, name: s }));
                                patch.activityTypes = newActivities;
                              }

                              // Groepen per pool aanpassen
                              if (sc.groupsPerPool?.length && sc.groupCount) {
                                const segments = activeConfig.segments.length > 0 ? activeConfig.segments : [{ id: "pool-1", name: "Pool 1" }, { id: "pool-2", name: "Pool 2" }];
                                const newGroups: ConfigV2["groups"] = [];
                                let idx = 0;
                                for (let p = 0; p < segments.length; p++) {
                                  const count = sc.groupsPerPool[p] ?? 0;
                                  for (let g = 0; g < count; g++) {
                                    newGroups.push({
                                      id: `group-${idx + 1}`,
                                      name: activeConfig.groups[idx]?.name ?? `Groep ${idx + 1}`,
                                      segmentId: segments[p].id,
                                    });
                                    idx++;
                                  }
                                }
                                patch.groups = newGroups;
                              }

                              if (Object.keys(patch).length > 0) {
                                updateConfig(patch);
                                showMessage(`Advies "${scenario.titel}" toegepast. Pas eventueel aan en genereer opnieuw.`, "success");
                              }
                              setAdvisorOpen(false);
                            }}
                          >
                            Toepassen
                          </button>
                        )}
                      </div>
                    ))}
                  </>
                )}
                {(!advisorResult.scenarios || advisorResult.scenarios.length === 0) && !advisorResult.probleem && (
                  <p className="muted">Geen specifieke aanbevelingen beschikbaar. Pas de configuratie handmatig aan.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmLoadPreset !== false && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmLoadPreset(false); }}>
          <div className="help-modal-card" style={{ width: "min(420px, 100%)" }}>
            <h3 style={{ margin: "0 0 8px" }}>Voorbeeld laden</h3>
            <p>Dit vervangt je huidige configuratie. Wil je eerst opslaan?</p>
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  await saveCurrent();
                  usePreset(confirmLoadPreset);
                  setJsonError(null);
                  setConfirmLoadPreset(false);
                  showMessage("Configuratie opgeslagen en voorbeeld geladen.", "success");
                }}
              >
                Opslaan en laden
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  usePreset(confirmLoadPreset);
                  setJsonError(null);
                  setConfirmLoadPreset(false);
                }}
              >
                Laden zonder opslaan
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setConfirmLoadPreset(false)}
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {!hasAnyData && !startDismissed ? (
        <div style={{ display: "grid", gap: 14 }}>
          <section className="card">
            <h2 style={{ margin: "0 0 4px" }}>Nieuwe kroegentocht instellen</h2>
            <p className="muted" style={{ margin: "0 0 14px" }}>Kies hoe je wilt beginnen.</p>
            <div className="start-mode-grid">
              <div className="start-mode-item">
                <button
                  type="button"
                  className="start-mode-option"
                  onClick={() => setShowWizard(true)}
                >
                  Stap voor stap instellen
                  <small>Een wizard begeleidt je door alle instellingen.</small>
                </button>
              </div>
              <div className="start-mode-item">
                <button
                  type="button"
                  className={startMode === "template" ? "start-mode-option is-active" : "start-mode-option"}
                  onClick={() => { setStartMode("template"); void loadTemplates(); }}
                >
                  Sjabloon laden
                  <small>Start met een voorbeeld of gebruik een eerder opgeslagen configuratie.</small>
                </button>
              </div>
              <div className="start-mode-item">
                <button
                  type="button"
                  className={startMode === "import" ? "start-mode-option is-active" : "start-mode-option"}
                  onClick={() => setStartMode("import")}
                >
                  Bestand importeren
                  <small>Upload een CSV of Excel met groepen of deelnemers.</small>
                </button>
              </div>
              <div className="start-mode-item">
                <button
                  type="button"
                  className={startMode === "empty" ? "start-mode-option is-active" : "start-mode-option"}
                  onClick={() => { setStartMode("empty"); setStartDismissed(true); }}
                >
                  Leeg beginnen
                  <small>Vul alles handmatig in, voor ervaren gebruikers.</small>
                </button>
              </div>
            </div>
          </section>

          {importSection}

          {configRecords.length > 0 && startMode === "empty" && (
            <section className="card">
              <h3 style={{ margin: "0 0 10px" }}>Opgeslagen configuraties</h3>
              <ul className="simple-list">
                {configRecords.map((record) => (
                  <li key={record.id}>
                    <div>
                      <strong>{record.config.name}</strong>
                      <small>{new Date(record.updatedAtIso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
                    </div>
                    <div className="inline-actions">
                      <button type="button" className="btn-sm btn-primary" onClick={() => { void loadConfig(record.id); setStartDismissed(true); }}>
                        Openen
                      </button>
                      <button type="button" className="btn-sm danger-button" onClick={async () => { if (await confirmDialog({ title: "Configuratie verwijderen", message: `Configuratie "${record.config.name}" verwijderen?`, confirmLabel: "Verwijderen", variant: "danger" })) void deleteConfigRecord(record.id); }}>
                        Verwijder
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {startMode === "template" && (
            <section className="card">
              <h3>Sjabloon kiezen</h3>
              {templatesLoading && <p className="muted">Laden...</p>}
              <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
                Kies een kant-en-klaar sjabloon als startpunt voor je kroegentocht, of laad een eerder opgeslagen configuratie.
              </p>
              <ul className="simple-list">
                {BUILT_IN_PRESETS.map((preset) => {
                  const exceedsLimit = preset.totalGroups > planState.limits.maxGroups;
                  return (
                    <li key={preset.key} style={exceedsLimit ? { opacity: 0.6 } : undefined}>
                      <div>
                        <strong>{preset.label}</strong>
                        <small>{preset.description}</small>
                      </div>
                      <div className="inline-actions">
                        <button type="button" className={exceedsLimit ? "btn-sm btn-ghost" : "btn-sm btn-primary"} onClick={() => {
                          if (exceedsLimit) {
                            setUpgradeMessage(`Dit sjabloon heeft ${preset.totalGroups} groepen. Je huidige plan ondersteunt maximaal ${planState.limits.maxGroups} groepen. Upgrade naar Pro voor meer.`);
                            return;
                          }
                          usePreset(preset.key);
                          setJsonError(null);
                        }}>
                          {exceedsLimit ? "Pro" : "Laden"}
                        </button>
                      </div>
                    </li>
                  );
                })}
                {templates.map((tpl) => (
                  <li key={tpl.id}>
                    <div>
                      <strong>{tpl.name}</strong>
                      <small>{new Date(tpl.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</small>
                    </div>
                    <div className="inline-actions">
                      <button type="button" className="btn-sm btn-primary" onClick={() => loadTemplate(tpl)}>
                        Laden
                      </button>
                      <button type="button" className="btn-sm danger-button" onClick={() => void deleteTemplate(tpl.id)}>
                        Verwijder
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}

      {(hasAnyData || startDismissed) && (
        <>
      <section className="card">
        <header className="wizard-header">
          <div>
            <h2>Configurator</h2>
            <p>Stel pools, groepen, velden, stations en tijdschema in.</p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={generatingPlan || isFrozen || activeConfig.groups.length === 0 || activeConfig.stations.length === 0 || activeConfig.timeslots.length === 0}
              onClick={() => {
                if (activeConfig.groups.length > planState.limits.maxGroups) {
                  setUpgradeMessage(`Je huidige plan ondersteunt maximaal ${planState.limits.maxGroups} groepen. Upgrade naar Pro voor meer.`);
                  return;
                }
                setGeneratingPlan(true);
                setTimeout(async () => {
                const success = await generatePlan();
                if (success) {
                  router.push("/planner");
                } else {
                  // Generatie mislukt — advies-systeem aanroepen
                  setAdvisorOpen(true);
                  setAdvisorBusy(true);
                  setAdvisorError(null);
                  setAdvisorResult(null);
                  try {
                    // Config samenvatten voor de advisor
                    const poolGroups: Record<string, string[]> = {};
                    for (const g of activeConfig.groups) {
                      const pool = g.segmentId ?? "__default__";
                      if (!poolGroups[pool]) poolGroups[pool] = [];
                      poolGroups[pool].push(g.name);
                    }
                    const stationsPerLoc: Record<string, string[]> = {};
                    for (const s of activeConfig.stations) {
                      const locName = activeConfig.locations.find(l => l.id === s.locationId)?.name ?? s.locationId;
                      if (!stationsPerLoc[locName]) stationsPerLoc[locName] = [];
                      const actName = activeConfig.activityTypes.find(a => a.id === s.activityTypeId)?.name ?? s.name;
                      stationsPerLoc[locName].push(actName);
                    }
                    const poolSummary = Object.entries(poolGroups).map(([pid, groups]) => {
                      const segName = activeConfig.segments.find(s => s.id === pid)?.name ?? pid;
                      return `${segName}: ${groups.length} groepen`;
                    }).join(", ");
                    const stationSummary = Object.entries(stationsPerLoc).map(([loc, spellen]) => `${loc}: ${spellen.join(", ")}`).join("; ");
                    const summary = [
                      `Configuratie: ${activeConfig.name}`,
                      `Groepen: ${activeConfig.groups.length} totaal (${poolSummary})`,
                      `Spellen: ${activeConfig.activityTypes.map(a => a.name).join(", ")}`,
                      `Stations per locatie: ${stationSummary}`,
                      `Movement: ${activeConfig.movementPolicy}`,
                      `Tijdsloten: ${activeConfig.timeslots.filter(t => t.kind === "active").length} actief`,
                      `Fout bij genereren: ${uiMessage?.text ?? "onbekend"}`,
                    ].join("\n");

                    const res = await fetch("/api/advisor/analyze", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ schema: summary }),
                    });
                    if (res.ok) {
                      setAdvisorResult(await res.json());
                    } else {
                      setAdvisorError("Advies ophalen mislukt.");
                    }
                  } catch {
                    setAdvisorError("Advies ophalen mislukt.");
                  }
                  setAdvisorBusy(false);
                }
                setGeneratingPlan(false);
                }, 50);
              }}
            >
              {generatingPlan ? "Bezig met genereren..." : "Genereer planning"}
            </button>
            <button type="button" className="btn-secondary" disabled={isFrozen} onClick={async () => { if (isFrozen) return; await saveCurrent(); showMessage("Configuratie opgeslagen.", "success"); }}>
              Opslaan
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setShowImportInline(!showImportInline); setStartMode("import"); }}>
              {showImportInline ? "Verberg import" : "Importeren"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => {
              if (!planState.limits.canSaveTemplates) { setUpgradeMessage("Eigen sjablonen opslaan is beschikbaar met Pro Jaar."); return; }
              void saveAsTemplate();
            }}>
              Opslaan als sjabloon
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setStartDismissed(false);
                setStartMode("template");
                void loadTemplates();
              }}
            >
              Voorbeeld laden
            </button>
            <button
              type="button"
              className={advancedOpen ? "is-active" : "btn-ghost"}
              onClick={() => {
                setAdvancedTouched(true);
                setAdvancedOpen((v) => !v);
              }}
            >
              {advancedOpen ? "Verberg JSON" : "JSON editors"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (dirty) {
                  setConfirmClose(true);
                } else {
                  newConfig();
                  setStartDismissed(false);
                  setStartMode("empty");
                  setShowImportInline(false);
                }
              }}
            >
              Sluiten
            </button>
          </div>
        </header>

        <div className="form-grid">
          <label>
            <LabelWithHelp text="Naam" helpKey="configName" onOpenHelp={setActiveHelp} />
            <input
              value={activeConfig.name}
              onChange={(event) => updateConfig({ name: event.target.value })}
            />
          </label>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={activeConfig.segmentsEnabled}
              onChange={(event) => updateConfig({ segmentsEnabled: event.target.checked })}
            />
            <LabelWithHelp text="Pools gebruiken" helpKey="segmentsEnabled" onOpenHelp={setActiveHelp} />
          </label>
          <label>
            <LabelWithHelp text="Verplaatsbeleid" helpKey="movementPolicy" onOpenHelp={setActiveHelp} />
            <select
              value={activeConfig.movementPolicy}
              onChange={(event) =>
                updateConfig({ movementPolicy: event.target.value as ConfigV2["movementPolicy"] })
              }
            >
              <option value="free">Vrij</option>
              <option value="blocks">Blokken</option>
            </select>
          </label>
          <fieldset>
            <legend>Regels</legend>
            <div className="inline-fields">
              <label>
                <LabelWithHelp
                  text="Maximaal keer dezelfde tegenstander"
                  helpKey="matchupMaxPerPair"
                  onOpenHelp={setActiveHelp}
                />
                <input
                  type="number"
                  min={1}
                  value={activeConfig.constraints.matchupMaxPerPair}
                  onChange={(event) =>
                    updateConfig({
                      constraints: {
                        ...activeConfig.constraints,
                        matchupMaxPerPair: Number(event.target.value) || 1,
                      },
                    })
                  }
                />
              </label>
              <label>
                <LabelWithHelp text="Herhaal hetzelfde spel" helpKey="repeatActivity" onOpenHelp={setActiveHelp} />
                <select
                  value={activeConfig.constraints.avoidRepeatActivityType}
                  onChange={(event) =>
                    updateConfig({
                      constraints: {
                        ...activeConfig.constraints,
                        avoidRepeatActivityType: event.target
                          .value as ConfigV2["constraints"]["avoidRepeatActivityType"],
                      },
                    })
                  }
                >
                  <option value="off">Toestaan</option>
                  <option value="soft">Liever niet (waarschuwing)</option>
                  <option value="hard">Verbieden</option>
                </select>
              </label>
            </div>
          </fieldset>
        </div>

      </section>

      {showImportInline && importSection}

      <nav className="stepper-bar">
        {[
          { label: "Groepen", done: summary.groups > 0, target: "section-groepen" },
          { label: "Spellen", done: summary.activityTypes > 0, target: "section-spellen" },
          { label: "Locaties", done: summary.locations > 0, target: "section-locaties" },
          { label: "Stations", done: summary.stations > 0, target: "section-stations" },
          { label: "Tijdschema", done: summary.timeslots > 0, target: "section-tijdschema" },
          ...(activeConfig.segmentsEnabled
            ? [{ label: "Pools", done: summary.segments > 0, target: "section-pools" }]
            : []),
        ].map((step, i, arr) => (
          <span key={step.target} className="stepper-item">
            <button
              type="button"
              className={`stepper-dot ${step.done ? "done" : ""}`}
              onClick={() => {
                document.getElementById(step.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {step.done ? "\u2713" : i + 1}
            </button>
            <span className="stepper-label">{step.label}</span>
            {i < arr.length - 1 && <span className={`stepper-line ${step.done && arr[i + 1].done ? "done" : ""}`} />}
          </span>
        ))}
      </nav>

      <section className="card" id="section-pools">
        <CollapsibleSection title="Pools" count={activeConfig.segments.length} defaultOpen={activeConfig.segmentsEnabled && activeConfig.segments.length === 0} actions={<button type="button" className="btn-sm" onClick={() => { const id = nextNumericId("pool", activeConfig.segments.map((s) => s.id)); updateSegments([...activeConfig.segments, { id, name: `Pool ${activeConfig.segments.length + 1}` }]); }}>+ Pool</button>}>
          <div className="editor-list">
            {activeConfig.segments.map((segment, index) => (
              <div key={segment.id} className="editor-row">
                <input
                  value={segment.name}
                  onChange={(event) => {
                    const next = [...activeConfig.segments];
                    next[index] = { ...next[index], name: event.target.value };
                    updateSegments(next);
                  }}
                />
                <small className="muted">id: {segment.id}</small>
                <button
                  type="button"
                  className="danger-button btn-sm"
                  onClick={() => updateSegments(activeConfig.segments.filter((value) => value.id !== segment.id))}
                  disabled={activeConfig.segments.length <= 1}
                >
                  Verwijder
                </button>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </section>

      <section className="card" id="section-groepen">
        <CollapsibleSection title="Groepen" count={activeConfig.groups.length} defaultOpen={activeConfig.groups.length === 0} actions={<><button type="button" className="btn-sm" onClick={() => { const id = nextNumericId("group", activeConfig.groups.map((g) => g.id)); updateGroups([...activeConfig.groups, { id, name: `Groep ${activeConfig.groups.length + 1}`, segmentId: activeConfig.segments[0]?.id }]); }}>+ Groep</button><button type="button" className="btn-sm btn-ghost" onClick={() => updateConfig(splitGroupsAcrossSegments(activeConfig))}>Verdeel over pools</button></>}>
        <div className="table-wrap">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Pool</th>
                <th>Leden</th>
                <th>Actie</th>
              </tr>
            </thead>
            <tbody>
              {activeConfig.groups.map((group, index) => (
                <tr key={group.id}>
                  <td>
                    <input
                      value={group.name}
                      onChange={(event) => {
                        const next = [...activeConfig.groups];
                        next[index] = { ...next[index], name: event.target.value };
                        updateGroups(next);
                      }}
                    />
                    <small className="muted">id: {group.id}</small>
                  </td>
                  <td>
                    <select
                      value={group.segmentId ?? ""}
                      disabled={!activeConfig.segmentsEnabled}
                      onChange={(event) => {
                        const next = [...activeConfig.groups];
                        next[index] = {
                          ...next[index],
                          segmentId: event.target.value || undefined,
                        };
                        updateGroups(next);
                      }}
                    >
                      {!activeConfig.segmentsEnabled ? <option value="">Geen pools</option> : null}
                      {activeConfig.segments.map((segment) => (
                        <option key={segment.id} value={segment.id}>
                          {segment.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-sm btn-ghost"
                      onClick={async () => {
                        // Ensure config is persisted so the FK on group_memberships resolves.
                        await saveCurrent();
                        setEditingMembersGroupId(group.id);
                      }}
                      title="Beheer leden"
                    >
                      {groupMemberCounts[group.id] ?? 0} leden
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => updateGroups(activeConfig.groups.filter((item) => item.id !== group.id))}
                    >
                      Verwijder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </CollapsibleSection>
      </section>

      <section className="card" id="section-spellen">
        <CollapsibleSection title="Spellen" count={activeConfig.activityTypes.length} defaultOpen={activeConfig.activityTypes.length === 0} actions={<button type="button" className="btn-sm" onClick={() => { const id = nextNumericId("activity", activeConfig.activityTypes.map((a) => a.id)); updateConfig({ activityTypes: [...activeConfig.activityTypes, { id, name: `Spel ${activeConfig.activityTypes.length + 1}`, baseId: null }] }); }}>+ Spel</button>}>
        <div className="editor-list">
          {activeConfig.activityTypes.map((activityType, index) => (
            <div key={activityType.id} className="editor-row">
              <input
                value={activityType.name}
                onChange={(event) => {
                  const next = [...activeConfig.activityTypes];
                  next[index] = { ...next[index], name: event.target.value };
                  updateConfig({ activityTypes: next });
                }}
              />
              <small className="muted">id: {activityType.id}</small>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  const nextTypes = activeConfig.activityTypes.filter((item) => item.id !== activityType.id);
                  const fallbackType = nextTypes[0]?.id;
                  const nextStations = activeConfig.stations
                    .filter((station) => station.activityTypeId !== activityType.id)
                    .map((station) => ({
                      ...station,
                      activityTypeId: station.activityTypeId || fallbackType || "",
                    }));
                  updateConfig({ activityTypes: nextTypes, stations: nextStations });
                }}
              >
                Verwijder
              </button>
            </div>
          ))}
        </div>
        </CollapsibleSection>
      </section>

      {activeConfig.activityTypes.length > 0 && activeConfig.stations.length > 0 && (
        <MaterialsSection config={activeConfig} onUpdateOverrides={(overrides) => updateConfig({ materialOverrides: overrides })} />
      )}

      <section className="card" id="section-locaties">
        <CollapsibleSection
          title="Locaties"
          count={activeConfig.locations.length}
          defaultOpen={activeConfig.locations.length === 0}
          actions={
            <>
              <button
                type="button"
                className="btn-sm"
                onClick={() => {
                  const id = nextNumericId("locatie", activeConfig.locations.map((l) => l.id));
                  updateConfig({
                    locations: [...activeConfig.locations, { id, name: `Locatie ${activeConfig.locations.length + 1}` }],
                  });
                }}
              >
                + Locatie
              </button>
              <button type="button" className="btn-sm btn-ghost" onClick={() => setShowVenueSearch(true)}>
                🔍 Zoek kroegen
              </button>
            </>
          }
        >
        <div className="editor-list">
          {activeConfig.locations.map((location, index) => (
            <div key={location.id} className="editor-row">
              <input
                value={location.name}
                onChange={(event) => {
                  const next = [...activeConfig.locations];
                  next[index] = { ...next[index], name: event.target.value };
                  updateConfig({ locations: next });
                }}
              />
              <small className="muted">id: {location.id}</small>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  const nextLocations = activeConfig.locations.filter((item) => item.id !== location.id);
                  const nextStations = activeConfig.stations.filter((station) => station.locationId !== location.id);
                  const nextBlocks = (activeConfig.locationBlocks ?? []).map((block) => {
                    const nextMap = { ...block.segmentLocationMap };
                    for (const [segmentId, locationId] of Object.entries(nextMap)) {
                      if (locationId === location.id) {
                        delete nextMap[segmentId];
                      }
                    }
                    return { ...block, segmentLocationMap: nextMap };
                  });
                  updateConfig({
                    locations: nextLocations,
                    stations: nextStations,
                    locationBlocks: nextBlocks,
                  });
                }}
              >
                Verwijder
              </button>
            </div>
          ))}
        </div>
        </CollapsibleSection>
      </section>

      <section className="card" id="section-stations" style={activeConfig.scheduleSettings.mode === "solo" ? { display: "none" } : undefined}>
        <CollapsibleSection title="Spellen per kroeg" count={activeConfig.stations.length} defaultOpen={activeConfig.stations.length === 0}>
        {activeConfig.locations.length === 0 ? (
          <p className="muted">Voeg eerst een veld toe.</p>
        ) : null}
        {activeConfig.locations.map((location) => {
          const stations = activeConfig.stations.filter((station) => station.locationId === location.id);
          return (
            <article className="sub-card" key={location.id}>
              <header className="wizard-header">
                <h4>{location.name}</h4>
                <button type="button" onClick={() => addStationForLocation(location.id)}>
                  + Station
                </button>
              </header>
              {stations.length === 0 ? <p className="muted">Nog geen stations op dit veld.</p> : null}
              <div className="table-wrap">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Station</th>
                      <th>Spel</th>
                      <th>Capaciteit min/max</th>
                      <th>Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stations.map((station) => {
                      const stationIndex = activeConfig.stations.findIndex((item) => item.id === station.id);
                      return (
                        <tr key={station.id}>
                          <td>
                            <input
                              value={station.name}
                              onChange={(event) => {
                                const next = [...activeConfig.stations];
                                next[stationIndex] = { ...next[stationIndex], name: event.target.value };
                                updateConfig({ stations: next });
                              }}
                            />
                            <small className="muted">id: {station.id}</small>
                          </td>
                          <td>
                            <select
                              value={station.activityTypeId}
                              onChange={(event) => {
                                const next = [...activeConfig.stations];
                                next[stationIndex] = {
                                  ...next[stationIndex],
                                  activityTypeId: event.target.value,
                                };
                                updateConfig({ stations: next });
                              }}
                            >
                              {activeConfig.activityTypes.map((activityType) => (
                                <option key={activityType.id} value={activityType.id}>
                                  {activityType.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="station-capacity">
                              <input
                                type="number"
                                min={1}
                                value={station.capacityGroupsMin}
                                onChange={(event) => {
                                  const nextMin = Math.max(1, Number(event.target.value) || 1);
                                  const next = [...activeConfig.stations];
                                  next[stationIndex] = {
                                    ...next[stationIndex],
                                    capacityGroupsMin: nextMin,
                                    capacityGroupsMax: Math.max(nextMin, next[stationIndex].capacityGroupsMax),
                                  };
                                  updateConfig({ stations: next });
                                }}
                              />
                              <input
                                type="number"
                                min={1}
                                value={station.capacityGroupsMax}
                                onChange={(event) => {
                                  const nextMax = Math.max(1, Number(event.target.value) || 1);
                                  const next = [...activeConfig.stations];
                                  next[stationIndex] = {
                                    ...next[stationIndex],
                                    capacityGroupsMin: Math.min(next[stationIndex].capacityGroupsMin, nextMax),
                                    capacityGroupsMax: nextMax,
                                  };
                                  updateConfig({ stations: next });
                                }}
                              />
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="danger-button"
                              onClick={() =>
                                updateConfig({
                                  stations: activeConfig.stations.filter((item) => item.id !== station.id),
                                })
                              }
                            >
                              Verwijder
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
        </CollapsibleSection>
      </section>

      <section className="card" id="section-tijdschema">
        <CollapsibleSection title="Tijdschema" count={activeConfig.timeslots.length} defaultOpen={activeConfig.timeslots.length === 0}>
        <div className="schedule-builder">
          <label>
            <LabelWithHelp text="Starttijd" helpKey="scheduleStart" onOpenHelp={setActiveHelp} />
            <input type="time" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} />
          </label>
          <label>
            <LabelWithHelp text="Duur per ronde (min)" helpKey="scheduleDuration" onOpenHelp={setActiveHelp} />
            <input
              type="number"
              min={5}
              value={scheduleDuration}
              onChange={(event) => {
                setScheduleDuration(Number(event.target.value) || 0);
              }}
            />
          </label>
          <label>
            <LabelWithHelp
              text="Wisseltijd tussen rondes (min)"
              helpKey="scheduleTransition"
              onOpenHelp={setActiveHelp}
            />
            <input
              type="number"
              min={0}
              value={scheduleTransition}
              onChange={(event) => {
                const nextTransition = Math.max(0, Number(event.target.value) || 0);
                setScheduleTransition(nextTransition);
                updateConfig({
                  scheduleSettings: {
                    roundDurationMinutes: Math.max(5, Number(scheduleDuration) || 15),
                    transitionMinutes: nextTransition,
                    scheduleMode: activeConfig.scheduleSettings.scheduleMode,
                  },
                });
              }}
            />
          </label>
          <label>
            <LabelWithHelp text="Aantal rondes" helpKey="scheduleRounds" onOpenHelp={setActiveHelp} />
            <input
              type="number"
              min={1}
              value={scheduleRounds}
              onChange={(event) => setScheduleRounds(Number(event.target.value) || 10)}
            />
          </label>
          <label>
            <LabelWithHelp text="Pauze slot(s)" helpKey="scheduleBreakSlots" onOpenHelp={setActiveHelp} />
            <input
              value={scheduleBreakSlots}
              onChange={(event) => setScheduleBreakSlots(event.target.value)}
              placeholder="5 of 5,8"
            />
          </label>
          <div className="inline-actions">
            <button type="button" onClick={createTimeslotPlan}>
              {orderedTimeslots.length > 0 ? "Update tijdsloten" : "Genereer tijdsloten"}
            </button>
            {orderedTimeslots.length > 0 && (
              <button type="button" onClick={() => setAddSlotOpen(true)}>
                + Slot
              </button>
            )}
          </div>
        </div>

        {addSlotOpen && (
          <AddSlotModal
            timeslots={orderedTimeslots}
            defaultDuration={scheduleDuration}
            onClose={() => setAddSlotOpen(false)}
            onAdd={(afterSlotId, kind, durationMinutes) => {
              const sorted = [...activeConfig.timeslots].sort((a, b) => a.index - b.index);
              const transition = Math.max(0, scheduleTransition);
              const dur = Math.max(1, durationMinutes);

              let insertAfterIndex: number;
              let startTime: Date;

              if (!afterSlotId) {
                // Insert at the very beginning
                insertAfterIndex = -1;
                const first = sorted[0];
                if (first) {
                  // Push everything forward: new slot starts where first slot starts
                  startTime = new Date(first.start);
                } else {
                  startTime = new Date(Date.UTC(2026, 0, 1, 9, 0, 0, 0));
                }
              } else {
                const afterSlot = sorted.find((s) => s.id === afterSlotId);
                if (!afterSlot) return;
                insertAfterIndex = sorted.indexOf(afterSlot);
                startTime = new Date(new Date(afterSlot.end).getTime() + transition * 60_000);
              }

              const endTime = new Date(startTime.getTime() + dur * 60_000);
              const fmt = (d: Date) =>
                `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
              const newSlotId = nextNumericId("slot", activeConfig.timeslots.map((s) => s.id));
              // Build the new ordered list: before + new slot + shifted after
              const before = sorted.slice(0, insertAfterIndex + 1);
              const after = sorted.slice(insertAfterIndex + 1);
              const shiftMs = (dur + transition) * 60_000;
              const shifted = after.map((s) => ({
                ...s,
                start: new Date(new Date(s.start).getTime() + shiftMs).toISOString(),
                end: new Date(new Date(s.end).getTime() + shiftMs).toISOString(),
                label: `${fmt(new Date(new Date(s.start).getTime() + shiftMs))} - ${fmt(new Date(new Date(s.end).getTime() + shiftMs))}`,
              }));

              const newSlot: TimeslotV2 = {
                id: newSlotId,
                start: startTime.toISOString(),
                end: endTime.toISOString(),
                label: `${fmt(startTime)} - ${fmt(endTime)}`,
                kind,
                index: insertAfterIndex + 2, // place after 'before' slots
              };

              // Assign sequential indexes so reindexTimeslots sorts correctly
              const combined = [
                ...before.map((s, i) => ({ ...s, index: i + 1 })),
                { ...newSlot, index: before.length + 1 },
                ...shifted.map((s, i) => ({ ...s, index: before.length + 2 + i })),
              ];
              const reindexed = reindexTimeslots(combined);
              const remapped = remapLocationBlocksByTimeslotIndex(
                activeConfig.timeslots, reindexed, activeConfig.locationBlocks ?? []
              );
              updateConfig({
                timeslots: reindexed,
                locationBlocks: remapped,
                scheduleSettings: {
                  roundDurationMinutes: Math.max(5, Number(scheduleDuration) || 15),
                  transitionMinutes: transition,
                  scheduleMode: activeConfig.scheduleSettings.scheduleMode,
                },
              });
            }}
          />
        )}

        <div className="table-wrap">
          <table className="simple-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Start</th>
                <th>Eind</th>
                <th>Type</th>
                <th className="hide-mobile">Label</th>
                <th>Actie</th>
              </tr>
            </thead>
            <tbody>
              {orderedTimeslots.flatMap((slot, index) => {
                const nextSlot = orderedTimeslots[index + 1];
                const switchMinutes = nextSlot
                  ? Math.max(
                      0,
                      Math.round(
                        (new Date(nextSlot.start).getTime() - new Date(slot.end).getTime()) / 60_000
                      )
                    )
                  : null;
                const showTransition = Boolean(
                  nextSlot &&
                    switchMinutes !== null &&
                    switchMinutes > 0
                );

                return [
                  <tr key={slot.id}>
                    <td>{slot.index}</td>
                    <td>
                      <input
                        type="time"
                        value={formatTimeFromIso(slot.start)}
                        onChange={(event) => {
                          const next = activeConfig.timeslots.map((item) =>
                            item.id === slot.id
                              ? { ...item, start: setIsoTime(item.start, event.target.value) }
                              : item
                          );
                          updateConfig({ timeslots: reindexTimeslots(next) });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        value={formatTimeFromIso(slot.end)}
                        onChange={(event) => {
                          const next = activeConfig.timeslots.map((item) =>
                            item.id === slot.id ? { ...item, end: setIsoTime(item.end, event.target.value) } : item
                          );
                          updateConfig({ timeslots: reindexTimeslots(next) });
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={slot.kind}
                        onChange={(event) => {
                          const next = activeConfig.timeslots.map((item) =>
                            item.id === slot.id
                              ? { ...item, kind: event.target.value as TimeslotV2["kind"] }
                              : item
                          );
                          updateConfig({ timeslots: reindexTimeslots(next) });
                        }}
                      >
                        <option value="active">Actief</option>
                        <option value="break">Pauze</option>
                      </select>
                    </td>
                    <td className="hide-mobile">
                      <input
                        value={slot.label ?? ""}
                        onChange={(event) => {
                          const next = activeConfig.timeslots.map((item) =>
                            item.id === slot.id ? { ...item, label: event.target.value } : item
                          );
                          updateConfig({ timeslots: reindexTimeslots(next) });
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => {
                          const nextTimeslots = reindexTimeslots(
                            activeConfig.timeslots.filter((item) => item.id !== slot.id)
                          );
                          const nextBlocks = (activeConfig.locationBlocks ?? []).map((block) => ({
                            ...block,
                            timeslotIds: block.timeslotIds.filter((id) => id !== slot.id),
                          }));
                          updateConfig({ timeslots: nextTimeslots, locationBlocks: nextBlocks });
                        }}
                      >
                        Verwijder
                      </button>
                    </td>
                  </tr>,
                  showTransition ? (
                    <tr key={`switch-${slot.id}-${nextSlot.id}`} className="timeslot-transition-row">
                      <td colSpan={6}>
                        Wisseltijd: {switchMinutes} min ({formatTimeFromIso(slot.end)} -{" "}
                        {formatTimeFromIso(nextSlot.start)})
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
        </CollapsibleSection>
      </section>

      <section className="card">
        <CollapsibleSection title="Blokken (pool → veld)" count={activeConfig.locationBlocks?.length ?? 0} defaultOpen={false} actions={<><button type="button" className="btn-sm" onClick={addBlock}>+ Blok</button><button type="button" className="btn-sm btn-ghost" onClick={applySwapBlocksPreset}>Auto: wissel na pauze</button></>}>

        {activeConfig.movementPolicy !== "blocks" ? (
          <p className="muted">Zet verplaatsbeleid op "Blokken" om deze mapping te gebruiken.</p>
        ) : null}

        {(activeConfig.locationBlocks ?? []).length === 0 ? (
          <p className="muted">Nog geen blokken ingesteld.</p>
        ) : null}

        {(activeConfig.locationBlocks ?? []).map((block) => {
          const range = findBlockRange(block, orderedTimeslots);
          return (
            <article key={block.id} className="sub-card">
              <div className="block-header-row">
                <label>
                  Bloknaam
                  <input
                    value={block.name}
                    onChange={(event) => {
                      const nextBlocks = (activeConfig.locationBlocks ?? []).map((item) =>
                        item.id === block.id ? { ...item, name: event.target.value } : item
                      );
                      updateConfig({ locationBlocks: nextBlocks });
                    }}
                  />
                </label>
                <label>
                  Vanaf slot
                  <select
                    value={range.startId}
                    onChange={(event) => updateBlockRange(block.id, event.target.value, range.endId)}
                  >
                    {orderedTimeslots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label ?? slot.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tot slot
                  <select
                    value={range.endId}
                    onChange={(event) => updateBlockRange(block.id, range.startId, event.target.value)}
                  >
                    {orderedTimeslots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label ?? slot.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() =>
                    updateConfig({
                      locationBlocks: (activeConfig.locationBlocks ?? []).filter((item) => item.id !== block.id),
                    })
                  }
                >
                  Verwijder
                </button>
              </div>
              <div className="table-wrap">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Pool</th>
                      <th>Veld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeConfig.segments.map((segment) => (
                      <tr key={`${block.id}-${segment.id}`}>
                        <td>{segment.name}</td>
                        <td>
                          <select
                            value={block.segmentLocationMap[segment.id] ?? ""}
                            onChange={(event) => {
                              const nextBlocks = (activeConfig.locationBlocks ?? []).map((item) =>
                                item.id === block.id
                                  ? {
                                      ...item,
                                      segmentLocationMap: {
                                        ...item.segmentLocationMap,
                                        [segment.id]: event.target.value,
                                      },
                                    }
                                  : item
                              );
                              updateConfig({ locationBlocks: nextBlocks });
                            }}
                          >
                            <option value="">Kies veld</option>
                            {activeConfig.locations.map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
        </CollapsibleSection>
      </section>

      {advancedOpen ? (
        <section className="card">
          <h3>Expert modus (JSON)</h3>
          <p className="muted">Alleen nodig voor snelle bulk-aanpassingen. Structuur is strikt v2.</p>
          <div className="json-grid">
            <label>
              segments
              <textarea
                className="code-textarea"
                value={segmentsRaw}
                onChange={(event) => setSegmentsRaw(event.target.value)}
              />
            </label>
            <label>
              groups
              <textarea
                className="code-textarea"
                value={groupsRaw}
                onChange={(event) => setGroupsRaw(event.target.value)}
              />
            </label>
            <label>
              locations
              <textarea
                className="code-textarea"
                value={locationsRaw}
                onChange={(event) => setLocationsRaw(event.target.value)}
              />
            </label>
            <label>
              activityTypes
              <textarea
                className="code-textarea"
                value={activityTypesRaw}
                onChange={(event) => setActivityTypesRaw(event.target.value)}
              />
            </label>
            <label>
              stations
              <textarea
                className="code-textarea"
                value={stationsRaw}
                onChange={(event) => setStationsRaw(event.target.value)}
              />
            </label>
            <label>
              timeslots
              <textarea
                className="code-textarea"
                value={timeslotsRaw}
                onChange={(event) => setTimeslotsRaw(event.target.value)}
              />
            </label>
            <label>
              locationBlocks
              <textarea
                className="code-textarea"
                value={blocksRaw}
                onChange={(event) => setBlocksRaw(event.target.value)}
              />
            </label>
          </div>
          <div className="inline-actions">
            <button type="button" onClick={applyJsonSections}>
              Pas JSON secties toe
            </button>
          </div>
          {jsonError ? <p className="error-text">{jsonError}</p> : null}
        </section>
      ) : null}
        </>
      )}

      {activeHelp ? (
        <HelpModal
          title={HELP_TEXT[activeHelp].title}
          body={HELP_TEXT[activeHelp].body}
          onClose={() => setActiveHelp(null)}
        />
      ) : null}

    </div>
  );
}
