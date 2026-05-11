import type { ConfigV2, Id, PlanV2 } from "./model";

export type PrintLayout = "timeslot" | "overview";

export interface PrintExportOptions {
  title?: string;
  layout?: PrintLayout;
  includeBreakSlots?: boolean;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function groupNameMap(config: ConfigV2): Map<Id, string> {
  return new Map(config.groups.map((group) => [group.id, group.name]));
}

function stationMap(config: ConfigV2): Map<Id, ConfigV2["stations"][number]> {
  return new Map(config.stations.map((station) => [station.id, station]));
}

function locationNameMap(config: ConfigV2): Map<Id, string> {
  return new Map(config.locations.map((location) => [location.id, location.name]));
}

function renderGroupList(groupIds: Id[], names: Map<Id, string>): string {
  if (groupIds.length === 2) {
    return `${esc(names.get(groupIds[0]) ?? groupIds[0])} vs ${esc(names.get(groupIds[1]) ?? groupIds[1])}`;
  }
  return groupIds.map((id) => esc(names.get(id) ?? id)).join(" / ");
}

function renderByTimeslot(plan: PlanV2, config: ConfigV2, includeBreakSlots: boolean): string {
  const groups = groupNameMap(config);
  const stations = stationMap(config);
  const locations = locationNameMap(config);
  const slots = includeBreakSlots
    ? [...config.timeslots].sort((a, b) => a.index - b.index)
    : [...config.timeslots].filter((slot) => slot.kind !== "break").sort((a, b) => a.index - b.index);

  return slots
    .map((slot) => {
      if (slot.kind === "break") {
        return `<section class="page">
  <h2>${esc(slot.label ?? slot.id)}</h2>
  <p>Pauze / Wissel</p>
</section>`;
      }
      const allocations = plan.allocations.filter((allocation) => allocation.timeslotId === slot.id);
      const rows = allocations
        .map((allocation) => {
          const station = stations.get(allocation.stationId);
          const locationName = station ? locations.get(station.locationId) ?? station.locationId : "-";
          const stationName = station ? station.name : allocation.stationId;
          const groupsLabel = renderGroupList(allocation.groupIds, groups);
          return `<tr><td>${esc(locationName)}</td><td>${esc(stationName)}</td><td>${groupsLabel}</td></tr>`;
        })
        .join("");
      return `<section class="page">
  <h2>${esc(slot.label ?? slot.id)}</h2>
  <table>
    <thead><tr><th>Locatie</th><th>Station</th><th>Match</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">Geen planning</td></tr>'}</tbody>
  </table>
</section>`;
    })
    .join("\n");
}

function renderOverview(plan: PlanV2, config: ConfigV2): string {
  const groups = groupNameMap(config);
  const stations = stationMap(config);
  const locations = locationNameMap(config);
  const slotById = new Map(config.timeslots.map((slot) => [slot.id, slot]));
  const rows = [...plan.allocations]
    .sort((a, b) => {
      const slotA = slotById.get(a.timeslotId)?.index ?? 0;
      const slotB = slotById.get(b.timeslotId)?.index ?? 0;
      return slotA - slotB || a.stationId.localeCompare(b.stationId);
    })
    .map((allocation) => {
      const slot = slotById.get(allocation.timeslotId);
      const station = stations.get(allocation.stationId);
      const locationName = station ? locations.get(station.locationId) ?? station.locationId : "-";
      return `<tr>
  <td>${esc(slot?.label ?? allocation.timeslotId)}</td>
  <td>${esc(locationName)}</td>
  <td>${esc(station?.name ?? allocation.stationId)}</td>
  <td>${renderGroupList(allocation.groupIds, groups)}</td>
</tr>`;
    })
    .join("");

  return `<section class="page">
  <h2>Overzicht</h2>
  <table>
    <thead><tr><th>Tijdslot</th><th>Locatie</th><th>Station</th><th>Match</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">Geen planning</td></tr>'}</tbody>
  </table>
</section>`;
}

export function buildPrintHtml(
  plan: PlanV2,
  config: ConfigV2,
  options: PrintExportOptions = {}
): string {
  const title = esc(options.title ?? "Kroegentocht planning");
  const layout = options.layout ?? "timeslot";
  const includeBreakSlots = options.includeBreakSlots ?? true;
  const content =
    layout === "overview"
      ? renderOverview(plan, config)
      : renderByTimeslot(plan, config, includeBreakSlots);
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: "Avenir Next", "Segoe UI", sans-serif; margin: 20px; color: #111; }
    h1 { margin: 0 0 16px; }
    h2 { margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f7f7f7; }
    .page { break-inside: avoid; margin-bottom: 20px; }
    @media print {
      body { margin: 8mm; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${content}
</body>
</html>`;
}
