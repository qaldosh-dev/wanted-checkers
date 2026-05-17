import { query } from "./db.js";
import { getPlayerRanking } from "./playerStatsRepository.js";

const MODE_KEYS = {
  local_pvp: "localPvP",
  vs_ai: "vsAI",
  multiplayer: "multiplayer",
  blitz: "blitz",
  blind_hunt: "blindHunt"
};

const AI_DIFFICULTY_KEYS = {
  beginner: "beginnerAI",
  intermediate: "intermediateAI",
  expert: "expertAI"
};

export async function getPlayerStatsDashboard(userId, options = {}) {
  const executor = options.client ?? { query };
  const [ranking, matchesResult] = await Promise.all([
    getPlayerRanking(userId, options),
    executor.query(
      `SELECT m.id AS match_id,
              m.winner_user_id,
              m.loser_user_id,
              m.bounty_gain,
              m.bounty_loss,
              m.result,
              m.created_at,
              g.mode,
              g.ai_difficulty,
              g.player_one_user_id,
              g.player_two_user_id,
              g.status,
              g.winner
       FROM matches m
       JOIN games g ON g.id = m.game_id
       WHERE g.player_one_user_id = $1
          OR g.player_two_user_id = $1
          OR m.winner_user_id = $1
          OR m.loser_user_id = $1
       ORDER BY m.created_at ASC`,
      [userId]
    )
  ]);

  return buildDashboard(userId, ranking, matchesResult.rows);
}

export function buildDashboard(userId, ranking, rows) {
  const byMode = {
    localPvP: emptyRecord(),
    vsAI: emptyRecord(),
    multiplayer: emptyRecord(),
    blitz: emptyRecord(),
    blindHunt: emptyRecord()
  };
  const aiStats = {
    beginnerAI: emptyAiRecord(),
    intermediateAI: emptyAiRecord(),
    expertAI: emptyAiRecord()
  };
  const core = {
    totalGames: 0,
    wins: 0,
    losses: 0,
    draws: 0
  };
  const bounty = {
    totalBountyGained: 0,
    totalBountyLost: 0,
    averageBountyPerWin: 0,
    highestBountyGain: 0
  };
  const recentModeBreakdown = {};
  const allPerformance = [];

  for (const row of rows) {
    const result = resolveResult(row, userId);
    const modeKey = MODE_KEYS[row.mode] ?? "localPvP";
    const bountyChange = resolveBountyChange(row, result);

    incrementRecord(core, result);
    incrementRecord(byMode[modeKey], result);

    if (row.mode === "vs_ai") {
      const difficultyKey = AI_DIFFICULTY_KEYS[row.ai_difficulty] ?? "beginnerAI";
      if (result === "win") aiStats[difficultyKey].wins += 1;
      if (result === "loss") aiStats[difficultyKey].losses += 1;
      if (result === "draw") aiStats[difficultyKey].draws += 1;
    }

    if (result === "win") {
      bounty.totalBountyGained += Number(row.bounty_gain ?? 0);
      bounty.highestBountyGain = Math.max(bounty.highestBountyGain, Number(row.bounty_gain ?? 0));
    }
    if (result === "loss") bounty.totalBountyLost += Number(row.bounty_loss ?? 0);

    allPerformance.push({
      matchId: row.match_id,
      result,
      mode: row.mode ?? "local_pvp",
      modeKey,
      bountyChange,
      createdAt: row.created_at
    });
  }

  const bountyWins = allPerformance.filter((match) => match.result === "win").length;
  bounty.averageBountyPerWin = bountyWins > 0 ? Math.round(bounty.totalBountyGained / bountyWins) : 0;
  const recentPerformance = [...allPerformance].slice(-10).reverse();
  for (const match of recentPerformance) {
    recentModeBreakdown[match.modeKey] = (recentModeBreakdown[match.modeKey] ?? 0) + 1;
  }

  const displayWins = core.totalGames > 0 ? core.wins : ranking?.wins ?? 0;
  const displayLosses = core.totalGames > 0 ? core.losses : ranking?.losses ?? 0;
  const displayDraws = core.draws;
  const displayTotalGames = core.totalGames > 0 ? core.totalGames : displayWins + displayLosses;

  return {
    core: {
      ...core,
      totalGames: displayTotalGames,
      wins: displayWins,
      losses: displayLosses,
      draws: displayDraws,
      winRate: displayTotalGames > 0 ? Math.round((displayWins / displayTotalGames) * 1000) / 10 : 0,
      currentWinStreak: ranking?.currentWinStreak ?? 0,
      bestWinStreak: ranking?.bestWinStreak ?? 0,
      bounty: ranking?.bounty ?? 0,
      tier: ranking?.tier ?? "Unknown"
    },
    byMode,
    aiStats,
    bounty,
    ranks: {
      nationalRank: ranking?.nationalRank ?? null,
      regionalRank: ranking?.regionalRank ?? null,
      region: ranking?.city ?? null,
      isRegionalChampion: Boolean(ranking?.isRegionalChampion),
      isNationalChampion: Boolean(ranking?.isNationalChampion),
      prestigeLabel: ranking?.prestigeLabel ?? ""
    },
    recentPerformance: {
      results: recentPerformance.map((match) => resultLetter(match.result)),
      bountyChanges: recentPerformance.map((match) => match.bountyChange),
      matches: recentPerformance,
      modeBreakdown: recentModeBreakdown
    },
    bountyTrend: buildBountyTrend(allPerformance)
  };
}

function emptyRecord() {
  return { games: 0, wins: 0, losses: 0, draws: 0 };
}

function emptyAiRecord() {
  return { wins: 0, losses: 0, draws: 0 };
}

function incrementRecord(record, result) {
  if (Object.prototype.hasOwnProperty.call(record, "totalGames")) record.totalGames += 1;
  else record.games += 1;
  if (result === "win") record.wins += 1;
  else if (result === "loss") record.losses += 1;
  else record.draws += 1;
}

function resolveResult(row, userId) {
  if (row.result?.draw || row.status === "draw") return "draw";
  if (row.winner_user_id === userId) return "win";
  if (row.loser_user_id === userId) return "loss";
  if (row.player_one_user_id === userId) return row.winner === 1 ? "win" : "loss";
  if (row.player_two_user_id === userId) return row.winner === 2 ? "win" : "loss";
  return "draw";
}

function resolveBountyChange(row, result) {
  if (result === "win") return Number(row.bounty_gain ?? 0);
  if (result === "loss") return -Number(row.bounty_loss ?? 0);
  return 0;
}

function resultLetter(result) {
  if (result === "win") return "W";
  if (result === "loss") return "L";
  return "D";
}

function buildBountyTrend(matches) {
  let runningTotal = 0;
  return matches.map((match, index) => {
    runningTotal += match.bountyChange;
    return {
      matchNumber: index + 1,
      matchId: match.matchId,
      bountyChange: match.bountyChange,
      netBounty: runningTotal,
      createdAt: match.createdAt
    };
  });
}
