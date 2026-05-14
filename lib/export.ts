/**
 * Export utilities voor de kroegentocht-planner.
 * Client-side generatie van Excel, CSV en PDF.
 */

import type { ConfigV2, Id, PlanV2, SpelExplanation, MaterialItem } from "@core";
import { findSpelByKey } from "@core";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ---------------------------------------------------------------------------
// Logo helper
// ---------------------------------------------------------------------------

let cachedLogoDataUrl: string | null = null;
let cachedOrgLogo: string | null | undefined = undefined;

/**
 * Haal het logo op: eerst het org-logo (eigen upload), anders het standaard logo.
 */
async function getLogoDataUrl(): Promise<string | null> {
  // Probeer eerst het org-logo (cached na eerste fetch)
  if (cachedOrgLogo === undefined) {
    try {
      const res = await fetch("/api/org/logo");
      if (res.ok) {
        const data = await res.json();
        cachedOrgLogo = data.logoData ?? null;
      } else {
        cachedOrgLogo = null;
      }
    } catch {
      cachedOrgLogo = null;
    }
  }
  if (cachedOrgLogo) {
    await preloadLogoDimensions(cachedOrgLogo);
    return cachedOrgLogo;
  }

  // Fallback naar standaard logo
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const response = await fetch("/logo-horizontaal.jpg");
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        cachedLogoDataUrl = reader.result as string;
        await preloadLogoDimensions(cachedLogoDataUrl);
        resolve(cachedLogoDataUrl);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Reset de org-logo cache (bijv. na upload). */
export function resetLogoCache(): void {
  cachedOrgLogo = undefined;
  cachedLogoDimensions = null;
}

let cachedLogoDimensions: { width: number; height: number } | null = null;

function addLogo(doc: jsPDF, logoDataUrl: string | null): void {
  if (!logoDataUrl) return;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxHeight = 10;

  let logoWidth: number;
  let logoHeight: number;

  if (cachedLogoDimensions) {
    const ratio = cachedLogoDimensions.width / cachedLogoDimensions.height;
    logoHeight = maxHeight;
    logoWidth = logoHeight * ratio;
  } else {
    logoHeight = maxHeight;
    logoWidth = 35;
  }

  const x = pageWidth - logoWidth - 10;
  const y = 8;
  doc.addImage(logoDataUrl, "JPEG", x, y, logoWidth, logoHeight);
}

async function preloadLogoDimensions(dataUrl: string): Promise<void> {
  if (cachedLogoDimensions) return;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      cachedLogoDimensions = { width: img.naturalWidth, height: img.naturalHeight };
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lookupMap<T extends { id: Id }>(items: T[]): Map<Id, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function slotLabel(slot: ConfigV2["timeslots"][number]): string {
  if (slot.label) return slot.label;
  return `${formatTime(slot.start)} - ${formatTime(slot.end)}`;
}

interface GridCell {
  timeslotId: Id;
  stationId: Id;
  groupNames: string[];
}

function buildGrid(config: ConfigV2, plan: PlanV2) {
  const groupMap = lookupMap(config.groups);
  const stationMap = lookupMap(config.stations);
  const locationMap = lookupMap(config.locations);
  const activityMap = lookupMap(config.activityTypes);

  const sortedSlots = [...config.timeslots].sort((a, b) => a.index - b.index);
  const stations = config.stations.filter((s) => s.activityTypeId !== "activity-pause");

  const cells = new Map<string, GridCell>();
  for (const alloc of plan.allocations) {
    const key = `${alloc.timeslotId}:${alloc.stationId}`;
    const names = alloc.groupIds.map((gid) => groupMap.get(gid)?.name ?? gid);
    cells.set(key, { timeslotId: alloc.timeslotId, stationId: alloc.stationId, groupNames: names });
  }

  return { groupMap, stationMap, locationMap, activityMap, sortedSlots, stations, cells };
}

function stationHeader(station: ConfigV2["stations"][number], locationMap: Map<Id, ConfigV2["locations"][number]>, activityMap: Map<Id, ConfigV2["activityTypes"][number]>): string {
  const spel = activityMap.get(station.activityTypeId)?.name ?? "";
  const loc = locationMap.get(station.locationId)?.name ?? "";
  return `${spel} (${loc})`;
}

// ---------------------------------------------------------------------------
// Rooster data (voor Excel/CSV/PDF)
// ---------------------------------------------------------------------------

interface RoosterFilter {
  locationIds?: Id[];
  activityTypeIds?: Id[];
}

function buildRoosterData(config: ConfigV2, plan: PlanV2, filter?: RoosterFilter) {
  const { stationMap, locationMap, activityMap, sortedSlots, stations, cells } = buildGrid(config, plan);

  let filteredStations = stations;
  if (filter?.locationIds?.length) {
    filteredStations = filteredStations.filter((s) => filter.locationIds!.includes(s.locationId));
  }
  if (filter?.activityTypeIds?.length) {
    filteredStations = filteredStations.filter((s) => filter.activityTypeIds!.includes(s.activityTypeId));
  }

  const headers = ["Tijd", ...filteredStations.map((s) => stationHeader(s, locationMap, activityMap))];

  const rows: string[][] = [];
  for (const slot of sortedSlots) {
    const row: string[] = [slotLabel(slot)];
    if (slot.kind === "break") {
      row.push(...filteredStations.map(() => "Pauze"));
    } else {
      for (const station of filteredStations) {
        const cell = cells.get(`${slot.id}:${station.id}`);
        row.push(cell ? cell.groupNames.join(" vs ") : "");
      }
    }
    rows.push(row);
  }

  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Groepskaart data
// ---------------------------------------------------------------------------

interface GroupCardRow {
  tijd: string;
  ronde: number;
  spel: string;
  locatie: string;
  tegenstander: string;
}

function buildGroupCard(config: ConfigV2, plan: PlanV2, groupId: Id): GroupCardRow[] {
  const { stationMap, locationMap, activityMap, sortedSlots } = buildGrid(config, plan);
  const groupMap = lookupMap(config.groups);
  const group = groupMap.get(groupId);
  if (!group) return [];

  const rows: GroupCardRow[] = [];
  let ronde = 0;

  for (const slot of sortedSlots) {
    if (slot.kind === "break") continue;
    ronde++;

    const alloc = plan.allocations.find(
      (a) => a.timeslotId === slot.id && a.groupIds.includes(groupId)
    );

    if (!alloc) {
      rows.push({ tijd: slotLabel(slot), ronde, spel: "Rust", locatie: "", tegenstander: "" });
      continue;
    }

    const station = stationMap.get(alloc.stationId);
    const spel = station ? (activityMap.get(station.activityTypeId)?.name ?? "") : "";
    const locatie = station ? (locationMap.get(station.locationId)?.name ?? "") : "";
    const tegenstander = alloc.groupIds
      .filter((gid) => gid !== groupId)
      .map((gid) => groupMap.get(gid)?.name ?? gid)
      .join(", ");

    rows.push({ tijd: slotLabel(slot), ronde, spel, locatie, tegenstander });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Locatie-overzicht data
// ---------------------------------------------------------------------------

function buildLocationOverview(config: ConfigV2, plan: PlanV2, locationId: Id) {
  const { stationMap, locationMap, activityMap, sortedSlots, cells } = buildGrid(config, plan);
  const location = locationMap.get(locationId);
  const stationsAtLoc = config.stations.filter(
    (s) => s.locationId === locationId && s.activityTypeId !== "activity-pause"
  );

  const headers = ["Tijd", ...stationsAtLoc.map((s) => activityMap.get(s.activityTypeId)?.name ?? s.name)];
  const rows: string[][] = [];

  for (const slot of sortedSlots) {
    const row: string[] = [slotLabel(slot)];
    if (slot.kind === "break") {
      row.push(...stationsAtLoc.map(() => "Pauze"));
    } else {
      for (const station of stationsAtLoc) {
        const cell = cells.get(`${slot.id}:${station.id}`);
        row.push(cell ? cell.groupNames.join(" vs ") : "");
      }
    }
    rows.push(row);
  }

  return { locationName: location?.name ?? locationId, headers, rows };
}

// ---------------------------------------------------------------------------
// Export: Excel
// ---------------------------------------------------------------------------

export function exportRoosterExcel(config: ConfigV2, plan: PlanV2, filter?: RoosterFilter): void {
  const { headers, rows } = buildRoosterData(config, plan, filter);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rooster");
  XLSX.writeFile(wb, `${config.name} - Rooster.xlsx`);
}

// ---------------------------------------------------------------------------
// Export: CSV
// ---------------------------------------------------------------------------

export function exportRoosterCSV(config: ConfigV2, plan: PlanV2, filter?: RoosterFilter): void {
  const { headers, rows } = buildRoosterData(config, plan, filter);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${config.name} - Rooster.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Export: Rooster PDF
// ---------------------------------------------------------------------------

export async function exportRoosterPDF(config: ConfigV2, plan: PlanV2, filter?: RoosterFilter, orientation: "landscape" | "portrait" = "landscape"): Promise<void> {
  const { headers, rows } = buildRoosterData(config, plan, filter);
  const logo = await getLogoDataUrl();
  const doc = new jsPDF({ orientation });

  addLogo(doc, logo);

  doc.setFontSize(16);
  doc.text(config.name, 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Rooster", 14, 22);
  doc.setTextColor(0);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [74, 144, 226], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 255] },
  });

  doc.save(`${config.name} - Rooster.pdf`);
}

// ---------------------------------------------------------------------------
// Export: Groepskaarten PDF
// ---------------------------------------------------------------------------

export async function exportGroepsKaartenPDF(config: ConfigV2, plan: PlanV2, groupIds?: Id[], orientation: "landscape" | "portrait" = "portrait"): Promise<void> {
  const groups = groupIds
    ? config.groups.filter((g) => groupIds.includes(g.id))
    : config.groups;

  const logo = await getLogoDataUrl();
  const doc = new jsPDF({ orientation });

  groups.forEach((group, i) => {
    if (i > 0) doc.addPage();

    addLogo(doc, logo);

    doc.setFontSize(16);
    doc.text(group.name, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(config.name, 14, 22);
    doc.setTextColor(0);

    const rows = buildGroupCard(config, plan, group.id);
    const headers = ["Tijd", "Ronde", "Spel", "Locatie", "Tegenstander", "Score"];

    autoTable(doc, {
      head: [headers],
      body: rows.map((r) => [r.tijd, String(r.ronde), r.spel, r.locatie, r.tegenstander, ""]),
      startY: 28,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [74, 144, 226], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 255] },
      columnStyles: {
        5: { cellWidth: 30 },
      },
    });
  });

  const filename = groupIds?.length === 1
    ? `${config.name} - ${groups[0]?.name ?? "Groep"}.pdf`
    : `${config.name} - Groepskaarten.pdf`;
  doc.save(filename);
}

// ---------------------------------------------------------------------------
// Export: Locatie-overzicht PDF
// ---------------------------------------------------------------------------

export async function exportLocatieOverzichtPDF(config: ConfigV2, plan: PlanV2, locationIds?: Id[], orientation: "landscape" | "portrait" = "landscape"): Promise<void> {
  const locations = locationIds
    ? config.locations.filter((l) => locationIds.includes(l.id))
    : config.locations;

  const logo = await getLogoDataUrl();
  const doc = new jsPDF({ orientation });

  locations.forEach((location, i) => {
    if (i > 0) doc.addPage();

    addLogo(doc, logo);

    const { locationName, headers, rows } = buildLocationOverview(config, plan, location.id);

    doc.setFontSize(16);
    doc.text(locationName, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(config.name, 14, 22);
    doc.setTextColor(0);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [74, 144, 226], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 255] },
    });
  });

  doc.save(`${config.name} - Locatie-overzicht.pdf`);
}

// ---------------------------------------------------------------------------
// Export: Scorebord PDF
// ---------------------------------------------------------------------------

export async function exportScorebordPDF(config: ConfigV2, orientation: "landscape" | "portrait" = "portrait"): Promise<void> {
  const logo = await getLogoDataUrl();
  const doc = new jsPDF({ orientation });

  addLogo(doc, logo);

  doc.setFontSize(16);
  doc.text(config.name, 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Scorebord", 14, 22);
  doc.setTextColor(0);

  const groups = config.groups;
  const headers = ["#", "Groep", "Gewonnen", "Gelijk", "Verloren", "Punten"];
  const body = groups.map((g, i) => [String(i + 1), g.name, "", "", "", ""]);

  autoTable(doc, {
    head: [headers],
    body,
    startY: 28,
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [255, 107, 0], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [255, 250, 245] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      2: { cellWidth: 25, halign: "center" },
      3: { cellWidth: 25, halign: "center" },
      4: { cellWidth: 25, halign: "center" },
      5: { cellWidth: 25, halign: "center" },
    },
  });

  doc.save(`${config.name} - Scorebord.pdf`);
}

// ---------------------------------------------------------------------------
// Export: Spelbegeleider PDF (per station: speluitleg + materialen + schema)
// ---------------------------------------------------------------------------

export async function exportSpelbegeleiderPDF(config: ConfigV2, plan: PlanV2, orientation: "landscape" | "portrait" = "portrait", orgMaterials?: Record<string, MaterialItem[] | undefined>): Promise<void> {
  const { groupMap, locationMap, activityMap, sortedSlots, stations, cells } = buildGrid(config, plan);
  const logo = await getLogoDataUrl();
  const doc = new jsPDF({ orientation });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  stations.forEach((station, stationIdx) => {
    if (stationIdx > 0) doc.addPage();

    const activity = activityMap.get(station.activityTypeId);
    const location = locationMap.get(station.locationId);
    const spelName = activity?.name ?? "Spel";
    const locName = location?.name ?? "Kroeg";
    const baseId = activity?.baseId;
    const spel = baseId ? findSpelByKey(baseId) : null;
    const explanation = spel?.explanation;
    const orgItems = baseId ? orgMaterials?.[baseId] : undefined;
    const materials = orgItems ?? spel?.materials ?? [];

    let y = margin;

    addLogo(doc, logo);

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(spelName, margin, y + 7);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(locName, margin, y + 14);
    doc.setTextColor(0);
    y += 22;

    // Speluitleg
    if (explanation) {
      // Summary
      if (explanation.summary) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        const summaryLines = doc.splitTextToSize(explanation.summary, pageW - margin * 2);
        doc.text(summaryLines, margin, y);
        y += summaryLines.length * 4.5 + 4;
      }

      // Spelregels
      if (explanation.rules) {
        y = addSection(doc, "Spelregels", explanation.rules, margin, y, pageW, pageH);
      }

      // Varianten
      if (explanation.variants) {
        y = addSection(doc, "Varianten", explanation.variants, margin, y, pageW, pageH);
      }
    }

    // Materiaallijst
    if (materials.length > 0) {
      if (y + 20 > pageH - margin) { doc.addPage(); y = margin; }
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Materialen", margin, y + 4);
      y += 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      for (const item of materials) {
        if (y + 5 > pageH - margin) { doc.addPage(); y = margin; }
        doc.setDrawColor(160);
        doc.rect(margin, y, 3, 3);
        doc.text(`${item.name} — ${item.quantity} ${item.unit}${item.optional ? " (optioneel)" : ""}`, margin + 5, y + 2.5);
        y += 5;
      }
      y += 4;
    }

    // Veldopzet (aparte sectie, evt. nieuwe pagina)
    if (explanation?.fieldSetup) {
      if (y + 25 > pageH - margin) { doc.addPage(); y = margin; }
      y = addSection(doc, "Veldopzet", explanation.fieldSetup, margin, y, pageW, pageH);
    }

    // Spelletjeschema met scorekolom
    const stationSlots = sortedSlots
      .filter((slot) => slot.kind === "active")
      .map((slot) => {
        const cell = cells.get(`${slot.id}:${station.id}`);
        return { time: slotLabel(slot), groups: cell ? cell.groupNames.join(" vs ") : "—" };
      });

    if (stationSlots.length > 0) {
      doc.addPage(); y = margin;

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Spelletjeschema", margin, y + 4);
      y += 8;

      autoTable(doc, {
        head: [["Tijd", "Groepen", "Score"]],
        body: stationSlots.map((s) => [s.time, s.groups, ""]),
        startY: y,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [74, 144, 226], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 255] },
        columnStyles: { 2: { cellWidth: 30, halign: "center" } },
        margin: { left: margin, right: margin },
      });
    }
  });

  doc.save(`${config.name} - Spelbegeleiders.pdf`);
}

function addSection(doc: jsPDF, title: string, text: string, margin: number, startY: number, pageW: number, pageH: number): number {
  let y = startY;
  if (y + 15 > pageH - margin) { doc.addPage(); y = margin; }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, y + 4);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const lines = text.split("\n");
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, pageW - margin * 2 - 5);
    for (const wl of wrapped) {
      if (y + 4 > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(`• ${wl}`, margin + 2, y + 3);
      y += 4.5;
    }
  }
  y += 3;
  return y;
}

// ---------------------------------------------------------------------------
// Dagprogramma PDF
// ---------------------------------------------------------------------------

interface DagprogrammaItem {
  title: string;
  description?: string | null;
  startTime: string;
  endTime?: string | null;
  icon?: string;
}

const ICON_TEXT: Record<string, string> = { event: "", coffee: "☕", food: "🍖", trophy: "🏆", music: "🎵", speech: "🎤", flag: "🚩" };

export async function exportDagprogrammaPDF(
  config: ConfigV2,
  programItems: DagprogrammaItem[],
  orientation: "landscape" | "portrait" = "portrait",
): Promise<void> {
  const allTimeslots = [...config.timeslots].sort((a, b) => a.index - b.index);
  const activeTimeslots = allTimeslots.filter((t) => t.kind === "active");

  type Row = { sortMs: number; time: string; label: string; type: "round" | "break" | "transition" | "item" };
  const rows: Row[] = [];

  let roundNum = 0;
  for (let i = 0; i < allTimeslots.length; i++) {
    const slot = allTimeslots[i];
    if (i > 0) {
      const prevEnd = new Date(allTimeslots[i - 1].end).getTime();
      const curStart = new Date(slot.start).getTime();
      const gapMin = Math.round((curStart - prevEnd) / 60_000);
      if (gapMin > 0) {
        rows.push({ sortMs: prevEnd + 1, time: "", label: `Wisseltijd · ${gapMin} min`, type: "transition" });
      }
    }
    if (slot.kind === "active") {
      roundNum++;
      rows.push({ sortMs: new Date(slot.start).getTime(), time: slot.label || `${formatTime(slot.start)} – ${formatTime(slot.end)}`, label: `Ronde ${roundNum}/${activeTimeslots.length}`, type: "round" });
    } else {
      rows.push({ sortMs: new Date(slot.start).getTime(), time: slot.label || `${formatTime(slot.start)} – ${formatTime(slot.end)}`, label: "Pauze", type: "break" });
    }
  }

  const fmtLocal = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  for (const item of programItems) {
    const time = fmtLocal(item.startTime) + (item.endTime ? ` – ${fmtLocal(item.endTime)}` : "");
    const icon = ICON_TEXT[item.icon ?? "event"] ?? "";
    const desc = item.description ? ` — ${item.description}` : "";
    const sd = new Date(item.startTime);
    const fakeSortMs = Date.UTC(2026, 0, 1, sd.getHours(), sd.getMinutes(), 0, 0);
    rows.push({ sortMs: fakeSortMs, time, label: `${icon} ${item.title}${desc}`.trim(), type: "item" });
  }

  rows.sort((a, b) => a.sortMs - b.sortMs);

  const doc = new jsPDF({ orientation });
  const logoDataUrl = await getLogoDataUrl();
  addLogo(doc, logoDataUrl);

  doc.setFontSize(16);
  doc.text(`Dagprogramma — ${config.name}`, 14, logoDataUrl ? 30 : 14);

  autoTable(doc, {
    startY: logoDataUrl ? 36 : 20,
    head: [["Tijd", "Programma"]],
    body: rows.map((r) => [r.time, r.label]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [74, 144, 226] },
    columnStyles: { 0: { cellWidth: 40 } },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = rows[data.row.index];
      if (row?.type === "transition") {
        data.cell.styles.textColor = [150, 150, 150];
        data.cell.styles.fontStyle = "italic";
      } else if (row?.type === "item") {
        data.cell.styles.textColor = [74, 144, 226];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.save(`dagprogramma-${(config.name ?? "kroegentocht").replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
