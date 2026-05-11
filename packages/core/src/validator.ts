import type { ConfigV2, Id, PlanV2 } from "./model";

export type IssueSeverity = "error" | "warn" | "info";

export type IssueType =
  | "DOUBLE_BOOKING_GROUP"
  | "STATION_OVERBOOKED"
  | "CAPACITY_MISMATCH"
  | "CROSS_SEGMENT_MATCH"
  | "DUPLICATE_MATCHUP"
  | "BREAK_SLOT_HAS_ALLOCATIONS"
  | "REPEAT_ACTIVITYTYPE_FOR_GROUP"
  | "UNKNOWN_TIMESLOT"
  | "UNKNOWN_STATION"
  | "UNKNOWN_GROUP";

export interface Issue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  refs: {
    timeslotId?: Id;
    timeslotIds?: Id[];
    stationId?: Id;
    stationIds?: Id[];
    allocationId?: Id;
    allocationIds?: Id[];
    occurrences?: Array<{
      timeslotId: Id;
      stationId: Id;
      allocationId: Id;
    }>;
    groupIds?: Id[];
  };
}

function pairKey(a: Id, b: Id): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function createIssueFactory() {
  let seq = 0;
  const issues: Issue[] = [];
  return {
    issues,
    push(issue: Omit<Issue, "id">): void {
      issues.push({ id: `issue-${seq++}`, ...issue });
    },
  };
}

export function validatePlan(plan: PlanV2, config: ConfigV2): Issue[] {
  const out = createIssueFactory();
  const timeslotById = new Map(config.timeslots.map((timeslot) => [timeslot.id, timeslot]));
  const stationById = new Map(config.stations.map((station) => [station.id, station]));
  const groupById = new Map(config.groups.map((group) => [group.id, group]));

  const groupUsageByTimeslot = new Map<Id, Map<Id, number>>();
  const stationUsageByTimeslot = new Map<Id, Map<Id, number>>();
  const matchupCounts = new Map<string, number>();
  const activityTypeCountByGroup = new Map<Id, Map<Id, number>>();
  const activityTypeOccurrencesByGroup = new Map<
    Id,
    Map<
      Id,
      Array<{
        timeslotId: Id;
        stationId: Id;
        allocationId: Id;
      }>
    >
  >();

  for (const timeslot of config.timeslots) {
    groupUsageByTimeslot.set(timeslot.id, new Map());
    stationUsageByTimeslot.set(timeslot.id, new Map());
  }
  for (const group of config.groups) {
    activityTypeCountByGroup.set(group.id, new Map());
    activityTypeOccurrencesByGroup.set(group.id, new Map());
  }

  for (const allocation of plan.allocations) {
    const timeslot = timeslotById.get(allocation.timeslotId);
    const station = stationById.get(allocation.stationId);
    const uniqueGroupIds = unique(allocation.groupIds);

    if (!timeslot) {
      out.push({
        type: "UNKNOWN_TIMESLOT",
        severity: "error",
        message: `Allocation ${allocation.id} verwijst naar onbekend timeslot ${allocation.timeslotId}.`,
        refs: { allocationId: allocation.id, timeslotId: allocation.timeslotId },
      });
      continue;
    }
    if (!station) {
      out.push({
        type: "UNKNOWN_STATION",
        severity: "error",
        message: `Allocation ${allocation.id} verwijst naar onbekend station ${allocation.stationId}.`,
        refs: {
          allocationId: allocation.id,
          timeslotId: allocation.timeslotId,
          stationId: allocation.stationId,
        },
      });
      continue;
    }

    if (timeslot.kind === "break") {
      out.push({
        type: "BREAK_SLOT_HAS_ALLOCATIONS",
        severity: "error",
        message: `Break timeslot ${timeslot.id} bevat allocations.`,
        refs: {
          allocationId: allocation.id,
          timeslotId: timeslot.id,
          stationId: station.id,
          groupIds: uniqueGroupIds,
        },
      });
    }

    const slotStationUsage = stationUsageByTimeslot.get(timeslot.id) ?? new Map<Id, number>();
    stationUsageByTimeslot.set(timeslot.id, slotStationUsage);
    slotStationUsage.set(station.id, (slotStationUsage.get(station.id) ?? 0) + 1);

    const slotGroupUsage = groupUsageByTimeslot.get(timeslot.id) ?? new Map<Id, number>();
    groupUsageByTimeslot.set(timeslot.id, slotGroupUsage);
    for (const groupId of uniqueGroupIds) {
      if (!groupById.has(groupId)) {
        out.push({
          type: "UNKNOWN_GROUP",
          severity: "error",
          message: `Allocation ${allocation.id} bevat onbekende groep ${groupId}.`,
          refs: {
            allocationId: allocation.id,
            timeslotId: timeslot.id,
            stationId: station.id,
            groupIds: [groupId],
          },
        });
      }
      slotGroupUsage.set(groupId, (slotGroupUsage.get(groupId) ?? 0) + 1);
    }

    if (
      uniqueGroupIds.length < station.capacityGroupsMin ||
      uniqueGroupIds.length > station.capacityGroupsMax
    ) {
      out.push({
        type: "CAPACITY_MISMATCH",
        severity: "error",
        message: `Allocation ${allocation.id} heeft ${uniqueGroupIds.length} groepen, verwacht ${station.capacityGroupsMin}-${station.capacityGroupsMax}.`,
        refs: {
          allocationId: allocation.id,
          timeslotId: timeslot.id,
          stationId: station.id,
          groupIds: uniqueGroupIds,
        },
      });
    }

    const segments = uniqueGroupIds
      .map((groupId) => groupById.get(groupId)?.segmentId)
      .filter((value): value is string => typeof value === "string");
    if (config.constraints.requireSameSegmentForMatches && unique(segments).length > 1) {
      out.push({
        type: "CROSS_SEGMENT_MATCH",
        severity: "error",
        message: `Allocation ${allocation.id} bevat groepen uit meerdere segmenten.`,
        refs: {
          allocationId: allocation.id,
          timeslotId: timeslot.id,
          stationId: station.id,
          groupIds: uniqueGroupIds,
        },
      });
    }

    for (let i = 0; i < uniqueGroupIds.length; i += 1) {
      for (let j = i + 1; j < uniqueGroupIds.length; j += 1) {
        const g1 = uniqueGroupIds[i];
        const g2 = uniqueGroupIds[j];
        const segmentId = groupById.get(g1)?.segmentId ?? "no-segment";
        const key = `${segmentId}:${pairKey(g1, g2)}`;
        matchupCounts.set(key, (matchupCounts.get(key) ?? 0) + 1);
      }
    }

    for (const groupId of uniqueGroupIds) {
      const map = activityTypeCountByGroup.get(groupId) ?? new Map<Id, number>();
      map.set(station.activityTypeId, (map.get(station.activityTypeId) ?? 0) + 1);
      activityTypeCountByGroup.set(groupId, map);

      const occurrencesByType =
        activityTypeOccurrencesByGroup.get(groupId) ?? new Map<Id, Array<{ timeslotId: Id; stationId: Id; allocationId: Id }>>();
      const occurrences = occurrencesByType.get(station.activityTypeId) ?? [];
      occurrences.push({
        timeslotId: timeslot.id,
        stationId: station.id,
        allocationId: allocation.id,
      });
      occurrencesByType.set(station.activityTypeId, occurrences);
      activityTypeOccurrencesByGroup.set(groupId, occurrencesByType);
    }
  }

  for (const [timeslotId, stationUsage] of stationUsageByTimeslot.entries()) {
    for (const [stationId, count] of stationUsage.entries()) {
      if (count > 1) {
        out.push({
          type: "STATION_OVERBOOKED",
          severity: "error",
          message: `Station ${stationId} is ${count}x geboekt in timeslot ${timeslotId}.`,
          refs: { timeslotId, stationId },
        });
      }
    }
  }

  for (const [timeslotId, groupUsage] of groupUsageByTimeslot.entries()) {
    for (const [groupId, count] of groupUsage.entries()) {
      if (count > 1) {
        out.push({
          type: "DOUBLE_BOOKING_GROUP",
          severity: "error",
          message: `Groep ${groupId} is ${count}x geboekt in timeslot ${timeslotId}.`,
          refs: { timeslotId, groupIds: [groupId] },
        });
      }
    }
  }

  const maxPerPair = Math.max(1, config.constraints.matchupMaxPerPair);
  for (const [key, count] of matchupCounts.entries()) {
    if (count > maxPerPair) {
      const pairPart = key.split(":")[1];
      const [a, b] = pairPart.split("-");
      out.push({
        type: "DUPLICATE_MATCHUP",
        severity: "error",
        message: `Matchup ${a} vs ${b} komt ${count}x voor (max ${maxPerPair}).`,
        refs: { groupIds: [a, b] },
      });
    }
  }

  if (config.constraints.avoidRepeatActivityType !== "off") {
    const severity: IssueSeverity =
      config.constraints.avoidRepeatActivityType === "hard" ? "error" : "warn";
    for (const [groupId, typeCounts] of activityTypeCountByGroup.entries()) {
      for (const [activityTypeId, count] of typeCounts.entries()) {
        if (count > 1) {
          const occurrences =
            activityTypeOccurrencesByGroup.get(groupId)?.get(activityTypeId) ?? [];
          const firstOccurrence = occurrences[0];
          out.push({
            type: "REPEAT_ACTIVITYTYPE_FOR_GROUP",
            severity,
            message: `Groep ${groupId} heeft activityType ${activityTypeId} ${count}x.`,
            refs: {
              timeslotId: firstOccurrence?.timeslotId,
              stationId: firstOccurrence?.stationId,
              allocationId: firstOccurrence?.allocationId,
              timeslotIds: occurrences.map((item) => item.timeslotId),
              stationIds: occurrences.map((item) => item.stationId),
              allocationIds: occurrences.map((item) => item.allocationId),
              occurrences,
              groupIds: [groupId],
            },
          });
        }
      }
    }
  }

  return out.issues;
}

export function hasHardErrors(issues: Issue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
