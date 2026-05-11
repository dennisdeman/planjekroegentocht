import type { ConfigV2, Id, PlanV2 } from "./model";
import { hasHardErrors, type Issue, validatePlan } from "./validator";

export type PlanCommandV2 =
  | {
      type: "moveGroup";
      allocationId: Id;
      groupId: Id;
      toAllocationId: Id;
      toIndex?: number;
    }
  | {
      type: "swapGroups";
      allocationAId: Id;
      groupAId: Id;
      allocationBId: Id;
      groupBId: Id;
    }
  | {
      type: "replaceGroupInAllocation";
      allocationId: Id;
      fromGroupId: Id;
      toGroupId: Id;
    }
  | { type: "removeGroupFromAllocation"; allocationId: Id; groupId: Id }
  | { type: "addGroupToAllocation"; allocationId: Id; groupId: Id; toIndex?: number }
  | { type: "deleteAllocation"; allocationId: Id }
  | {
      type: "createAllocation";
      timeslotId: Id;
      stationId: Id;
      groupIds: Id[];
    }
  | { type: "changeAllocationTimeslot"; allocationId: Id; timeslotId: Id }
  | { type: "changeAllocationStation"; allocationId: Id; stationId: Id };

export type PlanCommand = PlanCommandV2;

export interface ApplyCommandResultV2 {
  plan: PlanV2;
  issues: Issue[];
  valid: boolean;
}

function clonePlan(plan: PlanV2): PlanV2 {
  return {
    ...plan,
    allocations: plan.allocations.map((allocation) => ({
      ...allocation,
      groupIds: [...allocation.groupIds],
      meta: allocation.meta ? { ...allocation.meta } : undefined,
    })),
  };
}

function clampIndex(index: number | undefined, length: number): number {
  if (typeof index !== "number" || Number.isNaN(index)) {
    return length;
  }
  return Math.max(0, Math.min(index, length));
}

export function applyCommand(plan: PlanV2, command: PlanCommandV2): PlanV2 {
  const next = clonePlan(plan);
  let changed = false;

  switch (command.type) {
    case "moveGroup": {
      const from = next.allocations.find((a) => a.id === command.allocationId);
      const to = next.allocations.find((a) => a.id === command.toAllocationId);
      if (!from || !to) {
        break;
      }
      const fromIndex = from.groupIds.indexOf(command.groupId);
      if (fromIndex === -1) {
        break;
      }
      if (from.id === to.id) {
        const [group] = from.groupIds.splice(fromIndex, 1);
        from.groupIds.splice(clampIndex(command.toIndex, from.groupIds.length), 0, group);
        changed = true;
        break;
      }
      from.groupIds.splice(fromIndex, 1);
      if (!to.groupIds.includes(command.groupId)) {
        to.groupIds.splice(clampIndex(command.toIndex, to.groupIds.length), 0, command.groupId);
      }
      changed = true;
      break;
    }
    case "swapGroups": {
      const a = next.allocations.find((x) => x.id === command.allocationAId);
      const b = next.allocations.find((x) => x.id === command.allocationBId);
      if (!a || !b) {
        break;
      }
      const ai = a.groupIds.indexOf(command.groupAId);
      const bi = b.groupIds.indexOf(command.groupBId);
      if (ai === -1 || bi === -1) {
        break;
      }
      a.groupIds[ai] = command.groupBId;
      b.groupIds[bi] = command.groupAId;
      changed = true;
      break;
    }
    case "replaceGroupInAllocation": {
      const allocation = next.allocations.find((a) => a.id === command.allocationId);
      if (!allocation) {
        break;
      }
      const idx = allocation.groupIds.indexOf(command.fromGroupId);
      if (idx === -1) {
        break;
      }
      allocation.groupIds[idx] = command.toGroupId;
      changed = true;
      break;
    }
    case "removeGroupFromAllocation": {
      const allocation = next.allocations.find((a) => a.id === command.allocationId);
      if (!allocation) {
        break;
      }
      const idx = allocation.groupIds.indexOf(command.groupId);
      if (idx === -1) {
        break;
      }
      allocation.groupIds.splice(idx, 1);
      changed = true;
      break;
    }
    case "addGroupToAllocation": {
      const allocation = next.allocations.find((a) => a.id === command.allocationId);
      if (!allocation || allocation.groupIds.includes(command.groupId)) {
        break;
      }
      allocation.groupIds.splice(
        clampIndex(command.toIndex, allocation.groupIds.length),
        0,
        command.groupId
      );
      changed = true;
      break;
    }
    case "deleteAllocation": {
      const before = next.allocations.length;
      next.allocations = next.allocations.filter((a) => a.id !== command.allocationId);
      changed = next.allocations.length !== before;
      break;
    }
    case "createAllocation": {
      next.allocations.push({
        id: `alloc-${Date.now()}-${next.allocations.length + 1}`,
        timeslotId: command.timeslotId,
        stationId: command.stationId,
        groupIds: [...command.groupIds],
      });
      changed = true;
      break;
    }
    case "changeAllocationTimeslot": {
      const allocation = next.allocations.find((a) => a.id === command.allocationId);
      if (!allocation) {
        break;
      }
      allocation.timeslotId = command.timeslotId;
      changed = true;
      break;
    }
    case "changeAllocationStation": {
      const allocation = next.allocations.find((a) => a.id === command.allocationId);
      if (!allocation) {
        break;
      }
      allocation.stationId = command.stationId;
      changed = true;
      break;
    }
    default: {
      const _exhaustive: never = command;
      void _exhaustive;
    }
  }

  if (!changed) {
    return plan;
  }
  return {
    ...next,
    version: plan.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function applyCommandWithValidation(
  plan: PlanV2,
  config: ConfigV2,
  command: PlanCommandV2
): ApplyCommandResultV2 {
  const next = applyCommand(plan, command);
  const issues = validatePlan(next, config);
  return {
    plan: next,
    issues,
    valid: !hasHardErrors(issues),
  };
}
