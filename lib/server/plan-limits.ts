/**
 * Feature gating: welke functies zijn beschikbaar per plan?
 *
 * Plan-statussen:
 * - free: 7 dagen proefperiode, daarna geblokkeerd
 * - pro_event: 30 dagen volledige toegang, daarna bevroren (read-only)
 * - pro_year: 365 dagen volledige toegang, daarna bevroren
 *
 * Bevroren = alleen bekijken in de browser, geen exports, geen advies, geen genereren.
 * Geblokkeerd = geen toegang tot de app (full-screen upgrade popup).
 */

export type PlanType = "free" | "pro_event" | "pro_year";

export type PlanStatus = "active" | "expired" | "frozen";

export interface PlanLimits {
  maxGroups: number;
  maxActivePlannings: number;
  canExport: boolean;
  canUseAdvice: boolean;
  canUseFullValidation: boolean;
  canSaveTemplates: boolean;
  canGoLive: boolean;
  maxTeamMembers: number;
}

export interface OrgPlanState {
  plan: PlanType;
  status: PlanStatus;
  limits: PlanLimits;
  expiresAt: string | null;
  trialExpiresAt: string | null;
}

const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    maxGroups: 8,
    maxActivePlannings: 1,
    canExport: false,
    canUseAdvice: false,
    canUseFullValidation: false,
    canSaveTemplates: false,
    canGoLive: false,
    maxTeamMembers: 1,
  },
  pro_event: {
    maxGroups: 30,
    maxActivePlannings: 1,
    canExport: true,
    canUseAdvice: true,
    canUseFullValidation: true,
    canSaveTemplates: false,
    canGoLive: true,
    maxTeamMembers: 1,
  },
  pro_year: {
    maxGroups: 30,
    maxActivePlannings: 3,
    canExport: true,
    canUseAdvice: true,
    canUseFullValidation: true,
    canSaveTemplates: true,
    canGoLive: true,
    maxTeamMembers: 5,
  },
};

export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

/** Onbeperkte planState voor superadmins — bypast alle feature gating. */
export const SUPERADMIN_PLAN_STATE: OrgPlanState = {
  plan: "pro_year",
  status: "active",
  limits: {
    maxGroups: 999,
    maxActivePlannings: 999,
    canExport: true,
    canUseAdvice: true,
    canUseFullValidation: true,
    canSaveTemplates: true,
    canGoLive: true,
    maxTeamMembers: 999,
  },
  expiresAt: null,
  trialExpiresAt: null,
};

/**
 * Bepaal de huidige status van een organisatie-plan op basis van de
 * database-velden.
 */
export function resolveOrgPlanState(org: {
  active_plan: string;
  trial_expires_at: string | null;
  plan_expires_at: string | null;
  plan_frozen: boolean;
}): OrgPlanState {
  const plan = (org.active_plan === "pro_event" || org.active_plan === "pro_year")
    ? org.active_plan
    : "free" as PlanType;

  const now = new Date();

  // Bevroren staat (expliciet gezet door expiratie-logica)
  if (org.plan_frozen) {
    return {
      plan,
      status: "frozen",
      limits: getPlanLimits(plan),
      expiresAt: org.plan_expires_at,
      trialExpiresAt: org.trial_expires_at,
    };
  }

  // Free plan: check trial expiratie
  if (plan === "free") {
    if (org.trial_expires_at) {
      const trialEnd = new Date(org.trial_expires_at);
      if (now > trialEnd) {
        return {
          plan,
          status: "expired",
          limits: getPlanLimits(plan),
          expiresAt: null,
          trialExpiresAt: org.trial_expires_at,
        };
      }
    }
    return {
      plan,
      status: "active",
      limits: getPlanLimits(plan),
      expiresAt: null,
      trialExpiresAt: org.trial_expires_at,
    };
  }

  // Pro plans: check plan expiratie
  if (org.plan_expires_at) {
    const planEnd = new Date(org.plan_expires_at);
    if (now > planEnd) {
      return {
        plan,
        status: "frozen",
        limits: getPlanLimits(plan),
        expiresAt: org.plan_expires_at,
        trialExpiresAt: org.trial_expires_at,
      };
    }
  }

  return {
    plan,
    status: "active",
    limits: getPlanLimits(plan),
    expiresAt: org.plan_expires_at,
    trialExpiresAt: org.trial_expires_at,
  };
}

/**
 * Check of een specifieke actie is toegestaan. Retourneert null als het
 * mag, of een foutmelding als het niet mag.
 */
export function checkFeatureAccess(
  state: OrgPlanState,
  feature: "export" | "advice" | "fullValidation" | "saveTemplate" | "goLive" | "generate" | "edit"
): string | null {
  if (state.status === "expired") {
    return "Je proefperiode is verlopen. Upgrade naar Pro om verder te gaan.";
  }

  if (state.status === "frozen") {
    return "Je plan is verlopen. Verleng om weer te kunnen bewerken.";
  }

  switch (feature) {
    case "export":
      return state.limits.canExport ? null : "Export is beschikbaar met Pro Event of Pro Jaar.";
    case "advice":
      return state.limits.canUseAdvice ? null : "Het advies-systeem is beschikbaar met Pro Event of Pro Jaar.";
    case "fullValidation":
      return state.limits.canUseFullValidation ? null : "Volledige validatie is beschikbaar met Pro Event of Pro Jaar.";
    case "saveTemplate":
      return state.limits.canSaveTemplates ? null : "Eigen sjablonen opslaan is beschikbaar met Pro Jaar.";
    case "goLive":
      return state.limits.canGoLive ? null : "Live-modus is beschikbaar met Pro Event of Pro Jaar.";
    case "generate":
    case "edit":
      return null; // Altijd toegestaan als status active
    default:
      return null;
  }
}

export function checkGroupLimit(state: OrgPlanState, groupCount: number): string | null {
  if (groupCount > state.limits.maxGroups) {
    return `Je huidige plan ondersteunt maximaal ${state.limits.maxGroups} groepen. Upgrade naar Pro voor meer.`;
  }
  return null;
}

export function checkPlanningLimit(state: OrgPlanState, currentCount: number): string | null {
  if (currentCount >= state.limits.maxActivePlannings) {
    return `Je huidige plan ondersteunt maximaal ${state.limits.maxActivePlannings} actieve ${state.limits.maxActivePlannings === 1 ? "planning" : "planningen"}. Upgrade naar Pro Jaar voor meer.`;
  }
  return null;
}

export function checkTeamMemberLimit(state: OrgPlanState, currentCount: number): string | null {
  if (currentCount >= state.limits.maxTeamMembers) {
    return `Je huidige plan ondersteunt maximaal ${state.limits.maxTeamMembers} ${state.limits.maxTeamMembers === 1 ? "teamlid" : "teamleden"}. Upgrade naar Pro Jaar voor meer.`;
  }
  return null;
}
