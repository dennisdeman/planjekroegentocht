import type { Id } from "../model";

export type LiveStatus = "draft" | "live" | "completed";

export type LiveRole = "supervisor" | "program" | "scoreboard";

export type MatchStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type MatchCancelReason = "weather" | "no_show" | "injury" | "other";

export interface LiveConfig {
  /**
   * - "win_loss": klassiek wedstrijd-model met punten voor winst/gelijk/verlies.
   * - "goals_plus_win": punten voor winst + score telt mee in ranglijst.
   * - "ranking_only": alleen rangorde, geen punten.
   * - "challenge": single-team challenge per spel — geen tegenstander, score per team telt mee in totaal.
   */
  scoring: "win_loss" | "ranking_only" | "goals_plus_win" | "challenge";
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  tiebreaker: Array<"head_to_head" | "goal_difference" | "goals_for">;
  byePolicy: "no_points_no_average" | "average_of_played";
  showScoresOnProgram: boolean;
}

export const DEFAULT_LIVE_CONFIG: LiveConfig = {
  scoring: "challenge",
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreaker: ["goals_for", "head_to_head", "goal_difference"],
  byePolicy: "no_points_no_average",
  showScoresOnProgram: true,
};

export interface MatchResult {
  id: string;
  kroegentochtId: string;
  timeslotIndex: number;
  stationId: Id;
  groupAId: Id;
  groupBId: Id | null;
  scoreA: number | null;
  scoreB: number | null;
  status: MatchStatus;
  cancelReason: MatchCancelReason | null;
  cancelNote: string | null;
  version: number;
  enteredByTokenId: string | null;
  enteredByName: string | null;
  enteredAt: string | null;
  lastUpdatedAt: string;
}

export interface LiveAccessToken {
  id: string;
  kroegentochtId: string;
  role: LiveRole;
  scopeId: string | null;
  supervisorName: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
}

export interface LeaderboardEntry {
  groupId: Id;
  groupName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  rank: number;
}

export type LivePhase = "before_first" | "in_round" | "transition" | "after_last" | "not_live";

export interface LiveCursor {
  phase: LivePhase;
  currentTimeslotIndex: number | null;
  roundStartsAt: string | null;
  roundEndsAt: string | null;
  nextTimeslotIndex: number | null;
  nextRoundStartsAt: string | null;
  delaySeconds: number;
}

export interface LiveState {
  kroegentochtId: string;
  status: LiveStatus;
  startedAt: string | null;
  completedAt: string | null;
  scheduleOffsetSeconds: number;
  config: LiveConfig;
  cursor: {
    phase: LivePhase;
    currentTimeslotIndex: number | null;
    roundStartsAt: string | null;
    roundEndsAt: string | null;
    nextTimeslotIndex: number | null;
    nextRoundStartsAt: string | null;
    delaySeconds: number;
  };
  matches: MatchResult[];
  leaderboard: LeaderboardEntry[];
}
