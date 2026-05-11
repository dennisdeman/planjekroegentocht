"use client";

import { useSession } from "next-auth/react";
import type { OrgPlanState } from "./server/plan-limits";

const DEFAULT_STATE: OrgPlanState = {
  plan: "free",
  status: "active",
  limits: {
    maxGroups: 8,
    maxActivePlannings: 1,
    canExport: false,
    canUseAdvice: false,
    canUseFullValidation: false,
    canSaveTemplates: false,
    canGoLive: false,
    maxTeamMembers: 1,
  },
  expiresAt: null,
  trialExpiresAt: null,
};

export function usePlanState(): OrgPlanState {
  const { data: session } = useSession();
  return session?.user?.planState ?? DEFAULT_STATE;
}
