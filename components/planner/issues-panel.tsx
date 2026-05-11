import type { ConfigV2, Issue } from "@core";

interface IssuesPanelProps {
  issues: Issue[];
  config?: ConfigV2;
}

interface GroupedIssue {
  key: string;
  severity: Issue["severity"];
  type: Issue["type"];
  message: string;
  displayMessage: string;
  count: number;
  refs: Issue["refs"];
  refLabels: string;
}

const TYPE_LABELS: Partial<Record<Issue["type"], string>> = {
  DOUBLE_BOOKING_GROUP: "Dubbele boeking",
  STATION_OVERBOOKED: "Station bezet",
  CAPACITY_MISMATCH: "Capaciteit",
  CROSS_SEGMENT_MATCH: "Kruis-pool match",
  DUPLICATE_MATCHUP: "Dubbele matchup",
  BREAK_SLOT_HAS_ALLOCATIONS: "Pauzeslot gevuld",
  REPEAT_ACTIVITYTYPE_FOR_GROUP: "Herhaald spel",
  UNKNOWN_TIMESLOT: "Onbekend slot",
  UNKNOWN_STATION: "Onbekend station",
  UNKNOWN_GROUP: "Onbekende groep",
};

function shortType(type: Issue["type"]): string {
  return TYPE_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}

function severityWeight(severity: Issue["severity"]): number {
  if (severity === "error") return 3;
  if (severity === "warn") return 2;
  return 1;
}

function buildNameMaps(config?: ConfigV2) {
  const groups = new Map<string, string>();
  const activities = new Map<string, string>();
  const stations = new Map<string, string>();
  const timeslots = new Map<string, string>();
  if (!config) return { groups, activities, stations, timeslots };

  for (const g of config.groups) groups.set(g.id, g.name);
  for (const a of config.activityTypes) activities.set(a.id, a.name);
  for (const s of config.stations) stations.set(s.id, s.name);
  for (const t of config.timeslots) timeslots.set(t.id, t.label ?? `Slot ${t.index}`);
  return { groups, activities, stations, timeslots };
}

function humanizeMessage(message: string, names: ReturnType<typeof buildNameMaps>): string {
  let result = message;
  // Replace group IDs: "Groep group-1" → "Groep 1"
  result = result.replace(/(?:Groep |groep )(group-\w+)/g, (_, id) => names.groups.get(id) ?? id);
  // Replace bare group IDs in matchup messages
  result = result.replace(/Matchup (group-\w+) vs (group-\w+)/g, (_, a, b) =>
    `${names.groups.get(a) ?? a} vs ${names.groups.get(b) ?? b}`
  );
  // Replace activityType IDs
  result = result.replace(/activityType (activity-\w+)/g, (_, id) => names.activities.get(id) ?? id);
  // Replace station IDs
  result = result.replace(/Station (station-\w+)/g, (_, id) => names.stations.get(id) ?? id);
  // Replace timeslot IDs
  result = result.replace(/timeslot (slot-\w+)/g, (_, id) => names.timeslots.get(id) ?? id);
  // Replace allocation IDs with something shorter
  result = result.replace(/Allocation alloc-[^\s.]+/g, "Toewijzing");
  return result;
}

function humanizeRefs(refs: Issue["refs"], names: ReturnType<typeof buildNameMaps>): string {
  const parts: string[] = [];
  if (refs.timeslotId) {
    parts.push(names.timeslots.get(refs.timeslotId) ?? refs.timeslotId);
  }
  if (refs.stationId) {
    parts.push(names.stations.get(refs.stationId) ?? refs.stationId);
  }
  if (refs.groupIds && refs.groupIds.length > 0) {
    const groupNames = refs.groupIds.map((id) => names.groups.get(id) ?? id).join(", ");
    parts.push(groupNames);
  }
  return parts.join(" · ");
}

export function IssuesPanel({ issues, config }: IssuesPanelProps) {
  const names = buildNameMaps(config);

  const groupedIssues: GroupedIssue[] = [];
  const issueMap = new Map<string, GroupedIssue>();
  for (const issue of issues) {
    const key = `${issue.severity}|${issue.type}|${issue.message}`;
    const existing = issueMap.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const grouped: GroupedIssue = {
      key,
      severity: issue.severity,
      type: issue.type,
      message: issue.message,
      displayMessage: humanizeMessage(issue.message, names),
      count: 1,
      refs: issue.refs,
      refLabels: humanizeRefs(issue.refs, names),
    };
    issueMap.set(key, grouped);
    groupedIssues.push(grouped);
  }

  const severityCounts = issues.reduce(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { error: 0, warn: 0, info: 0 }
  );
  groupedIssues.sort((a, b) => {
    const bySeverity = severityWeight(b.severity) - severityWeight(a.severity);
    if (bySeverity !== 0) return bySeverity;
    const byCount = b.count - a.count;
    if (byCount !== 0) return byCount;
    return a.message.localeCompare(b.message);
  });

  const visibleIssues = groupedIssues.slice(0, 12);
  const hiddenIssueCount = groupedIssues.length - visibleIssues.length;

  if (issues.length === 0) {
    return (
      <section className="card issues-panel">
        <h3>Issues</h3>
        <p className="muted">Geen conflicten gevonden.</p>
      </section>
    );
  }

  return (
    <section className="card issues-panel">
      <div className="issues-header">
        <h3>
          Issues <span className="issues-total-pill">{issues.length}</span>
        </h3>
      </div>
      <div className="issues-summary-badges compact">
        <span className="issues-badge badge-error">Fouten {severityCounts.error}</span>
        <span className="issues-badge badge-warn">Waarschuwingen {severityCounts.warn}</span>
        <span className="issues-badge badge-info">Info {severityCounts.info}</span>
      </div>
      <ul className="issues-list">
        {visibleIssues.map((issue) => (
          <li key={issue.key} className={`issue-row compact severity-${issue.severity}`}>
            <div className="issue-row-header">
              <strong className="issue-type-badge">{shortType(issue.type)}</strong>
              {issue.count > 1 ? <span className="issue-count-badge">x{issue.count}</span> : null}
            </div>
            <span className="issue-message">{issue.displayMessage}</span>
            {issue.refLabels && <small className="muted">{issue.refLabels}</small>}
          </li>
        ))}
      </ul>
      {hiddenIssueCount > 0 ? (
        <p className="issues-hidden-note">+{hiddenIssueCount} extra issue-groepen</p>
      ) : null}
    </section>
  );
}
