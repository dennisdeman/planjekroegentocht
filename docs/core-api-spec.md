# Core API Spec (TypeScript)

## Doel
Eén planningmodel voor:
- automatisch genereren
- handmatig bewerken
- realtime valideren
- exporteren

## Kernprincipes
- `Plan` is de single source of truth.
- `Allocation.groupIds[]` is altijd een array (backward compatible met single-group).
- `Timeslot.kind` maakt pauze/lege blokken expliciet.
- `resourceId` maakt meerdere gelijktijdige matches op verschillende velden mogelijk.

## Model-overzicht

```ts
type TimeslotKind = "active" | "break" | "custom";
type ActivityCategory = "game" | "station" | "break";
type ActivityType = "solo" | "match" | "tournament";

interface Timeslot {
  id: string;
  index: number;
  startIso: string;
  endIso: string;
  label: string;
  kind: TimeslotKind;
}

interface ActivityDef {
  id: string;
  name: string;
  type: ActivityType;
  category: ActivityCategory;
  capacityGroupsMin: number;
  capacityGroupsMax: number;
  durationMin?: number;
  supervisorsRequired?: number;
}

interface Allocation {
  id: string;
  timeslotId: string;
  activityId: string;
  groupIds: string[];
  resourceId?: string;
  metadata?: Record<string, unknown>;
}
```

## Validator contracts

```ts
type IssueSeverity = "info" | "warn" | "error";
type IssueType =
  | "double_booking_group"
  | "capacity_mismatch"
  | "supervisors_exceeded"
  | "incomplete_schedule"
  | "overfilled_schedule"
  | "matchup_repeat"
  | "break_slot_has_allocation"
  | "unknown_activity"
  | "unknown_group"
  | "unknown_timeslot"
  | "unknown_resource";

interface ValidationIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  timeslotId?: string;
  allocationId?: string;
  activityId?: string;
  groupIds?: string[];
}

function validatePlan(plan: Plan, config: Config, options?: ValidationOptions): ValidationResult;
function validatePlanScoped(
  plan: Plan,
  config: Config,
  scope: ValidationScope,
  options?: Omit<ValidationOptions, "scope">
): ValidationResult;
```

## Editor command contracts

```ts
type PlanCommand =
  | { type: "moveGroup"; allocationId: string; groupId: string; toAllocationId: string; toIndex?: number }
  | { type: "swapGroups"; allocationAId: string; groupAId: string; allocationBId: string; groupBId: string }
  | { type: "changeTimeslot"; allocationId: string; newTimeslotId: string }
  | { type: "addGroupToAllocation"; allocationId: string; groupId: string; toIndex?: number }
  | { type: "removeGroupFromAllocation"; allocationId: string; groupId: string }
  | { type: "deleteAllocation"; allocationId: string }
  | { type: "createAllocation"; timeslotId: string; activityId: string; groupIds: string[]; resourceId?: string };

function applyCommand(plan: Plan, command: PlanCommand): Plan;
function applyCommandWithValidation(
  plan: Plan,
  config: Config,
  command: PlanCommand,
  options?: { validate?: boolean }
): { plan: Plan; issues: ValidationIssue[]; valid: boolean };
```

## Generator contracts

```ts
type GeneratorMode = "classic" | "multiGroup";

interface PlanScoreBreakdown {
  hardConflictPenalty: number;     // +1000 per error
  matchupRepeatPenalty: number;    // +10 per repeat
  idlePenalty: number;             // +5 per idle groep
  activityImbalancePenalty: number;// +1 per imbalance
  total: number;
}

function generatePlan(config: Config, options?: GeneratePlanOptions): GeneratePlanResult;
function scorePlan(plan: Plan, config: Config): PlanScoreBreakdown;
```

## Voorbeeld: 3 wedstrijden in 1 tijdslot

```json
{
  "timeslot": { "id": "t1", "label": "12:00-12:30", "kind": "active" },
  "allocations": [
    { "activityId": "voetbal", "resourceId": "veld-1", "groupIds": ["A", "B"] },
    { "activityId": "voetbal", "resourceId": "veld-2", "groupIds": ["C", "D"] },
    { "activityId": "voetbal", "resourceId": "veld-3", "groupIds": ["E", "F"] }
  ]
}
```

## Voorbeeld: pauze/lege blok
- `timeslot.kind = "break"` en geen allocations.
- Of expliciete break allocation voor duidelijke export.
