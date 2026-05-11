import type { ConfigV2, Id } from "../model";
import type {
  LeaderboardEntry,
  LiveConfig,
  MatchResult,
} from "./types";

interface Accum {
  groupId: Id;
  groupName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  headToHead: Map<Id, number>; // punten tegen specifieke tegenstander
}

/**
 * Bereken leaderboard uit match-resultaten. Alleen `completed` matches met
 * volledige score tellen mee. `cancelled` en byes (groupB = null) worden
 * genegeerd volgens de bye-policy.
 */
export function computeLeaderboard(
  config: ConfigV2,
  matches: MatchResult[],
  liveConfig: LiveConfig
): LeaderboardEntry[] {
  const acc = new Map<Id, Accum>();
  for (const g of config.groups) {
    acc.set(g.id, {
      groupId: g.id,
      groupName: g.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      headToHead: new Map(),
    });
  }

  for (const m of matches) {
    if (m.status !== "completed") continue;
    if (m.scoreA == null || m.scoreB == null) continue;
    if (!m.groupBId) continue; // bye

    const a = acc.get(m.groupAId);
    const b = acc.get(m.groupBId);
    if (!a || !b) continue;

    a.played += 1;
    b.played += 1;
    a.goalsFor += m.scoreA;
    a.goalsAgainst += m.scoreB;
    b.goalsFor += m.scoreB;
    b.goalsAgainst += m.scoreA;

    if (m.scoreA > m.scoreB) {
      a.wins += 1;
      b.losses += 1;
      a.points += liveConfig.pointsWin;
      b.points += liveConfig.pointsLoss;
      a.headToHead.set(m.groupBId, (a.headToHead.get(m.groupBId) ?? 0) + liveConfig.pointsWin);
      b.headToHead.set(m.groupAId, (b.headToHead.get(m.groupAId) ?? 0) + liveConfig.pointsLoss);
    } else if (m.scoreA < m.scoreB) {
      b.wins += 1;
      a.losses += 1;
      b.points += liveConfig.pointsWin;
      a.points += liveConfig.pointsLoss;
      b.headToHead.set(m.groupAId, (b.headToHead.get(m.groupAId) ?? 0) + liveConfig.pointsWin);
      a.headToHead.set(m.groupBId, (a.headToHead.get(m.groupBId) ?? 0) + liveConfig.pointsLoss);
    } else {
      a.draws += 1;
      b.draws += 1;
      a.points += liveConfig.pointsDraw;
      b.points += liveConfig.pointsDraw;
      a.headToHead.set(m.groupBId, (a.headToHead.get(m.groupBId) ?? 0) + liveConfig.pointsDraw);
      b.headToHead.set(m.groupAId, (b.headToHead.get(m.groupAId) ?? 0) + liveConfig.pointsDraw);
    }
  }

  // Sorteer volgens tie-break-prioriteit
  function compareEntries(x: Accum, y: Accum): number {
    const xPlayedFlag = x.played > 0 ? 1 : 0;
    const yPlayedFlag = y.played > 0 ? 1 : 0;
    if (yPlayedFlag !== xPlayedFlag) return yPlayedFlag - xPlayedFlag;

    if (y.points !== x.points) return y.points - x.points;
    for (const rule of liveConfig.tiebreaker) {
      if (rule === "goal_difference") {
        const xd = x.goalsFor - x.goalsAgainst;
        const yd = y.goalsFor - y.goalsAgainst;
        if (yd !== xd) return yd - xd;
      } else if (rule === "goals_for") {
        if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
      } else if (rule === "head_to_head") {
        const xVsY = x.headToHead.get(y.groupId) ?? 0;
        const yVsX = y.headToHead.get(x.groupId) ?? 0;
        if (yVsX !== xVsY) return yVsX - xVsY;
      }
    }
    return 0;
  }

  const sorted = Array.from(acc.values()).sort((x, y) => {
    const result = compareEntries(x, y);
    if (result !== 0) return result;
    return x.groupName.localeCompare(y.groupName, "nl", { numeric: true, sensitivity: "base" });
  });

  // Rank toekennen: alleen dezelfde rang als de comparator 0 geeft (echt gelijk)
  const entries: LeaderboardEntry[] = [];
  let currentRank = 0;
  sorted.forEach((entry, idx) => {
    if (idx === 0 || compareEntries(sorted[idx - 1], entry) !== 0) {
      currentRank = idx + 1;
    }
    entries.push({
      groupId: entry.groupId,
      groupName: entry.groupName,
      played: entry.played,
      wins: entry.wins,
      draws: entry.draws,
      losses: entry.losses,
      goalsFor: entry.goalsFor,
      goalsAgainst: entry.goalsAgainst,
      points: entry.points,
      rank: currentRank,
    });
  });

  return entries;
}
