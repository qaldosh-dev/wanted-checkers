import { P1, P1_KING, P2, P2_KING } from "../engine/checkers.js";

const BASE_WIN_BOUNTY = 1_000_000;
const LOSER_BOUNTY_PENALTY = 250_000;

const TIER_THRESHOLDS = [
  { min: 600_000_000, tier: "Emperor" },
  { min: 300_000_000, tier: "Warlord" },
  { min: 100_000_000, tier: "Notorious" },
  { min: 50_000_000, tier: "Dangerous" },
  { min: 10_000_000, tier: "Rising Menace" },
  { min: 1_000_000, tier: "Rookie Threat" },
  { min: 0, tier: "Unknown" }
];

export function calculateBountyResult({ board, winner, winnerStats, loserStats }) {
  const loser = winner === 1 ? 2 : 1;
  const winnerPieces = countPlayerPieces(board, winner);
  const loserPieces = countPlayerPieces(board, loser);
  const nextWinStreak = winnerStats.currentWinStreak + 1;
  const streakMultiplier = getStreakMultiplier(nextWinStreak);
  const bonusesApplied = getBonusesApplied(board, winner, winnerPieces, loserPieces);
  const bonusTotal = bonusesApplied.reduce((total, bonus) => total + bonus.amount, 0);
  const bountyGain = Math.round((BASE_WIN_BOUNTY + bonusTotal) * streakMultiplier);
  const bountyLoss = Math.min(LOSER_BOUNTY_PENALTY, loserStats.bounty);
  const winnerNewBounty = winnerStats.bounty + bountyGain;
  const loserNewBounty = Math.max(0, loserStats.bounty - LOSER_BOUNTY_PENALTY);
  const nextWinnerStats = toResultPlayer(
    winnerStats,
    winnerNewBounty,
    nextWinStreak,
    winnerStats.wins + 1,
    winnerStats.losses
  );
  const nextLoserStats = toResultPlayer(
    loserStats,
    loserNewBounty,
    0,
    loserStats.wins,
    loserStats.losses + 1
  );

  return {
    winner,
    loser,
    winnerDisplayName: winnerStats.displayName,
    loserDisplayName: loserStats.displayName,
    bountyGain,
    bountyLoss,
    winnerNewBounty,
    loserNewBounty,
    winnerTier: getBountyTier(winnerNewBounty),
    loserTier: getBountyTier(loserNewBounty),
    streakMultiplier,
    bonusesApplied,
    winnerStats: nextWinnerStats,
    loserStats: nextLoserStats
  };
}

export function buildUpdatedWinnerStats(stats, result) {
  const currentWinStreak = stats.currentWinStreak + 1;

  return {
    ...stats,
    bounty: result.winnerNewBounty,
    wins: stats.wins + 1,
    currentWinStreak,
    bestWinStreak: Math.max(stats.bestWinStreak, currentWinStreak),
    tier: result.winnerTier
  };
}

export function buildUpdatedLoserStats(stats, result) {
  return {
    ...stats,
    bounty: result.loserNewBounty,
    losses: stats.losses + 1,
    currentWinStreak: 0,
    tier: result.loserTier
  };
}

export function getBountyTier(bounty) {
  return TIER_THRESHOLDS.find((threshold) => bounty >= threshold.min).tier;
}

function getStreakMultiplier(winStreak) {
  if (winStreak >= 6) return 2.5;
  if (winStreak >= 4) return 2;
  if (winStreak >= 2) return 1.5;
  return 1;
}

function getBonusesApplied(board, winner, winnerPieces, loserPieces) {
  const bonuses = [];

  if (winnerPieces.total - loserPieces.total >= 3) {
    bonuses.push({
      code: "PIECE_ADVANTAGE",
      label: "3+ piece advantage",
      amount: 500_000
    });
  }

  if (winnerPieces.kings > 0) {
    bonuses.push({
      code: "KING_STANDING",
      label: "King on board",
      amount: 300_000
    });
  }

  if (loserPieces.total >= 5) {
    bonuses.push({
      code: "LIVE_ARMY_WIN",
      label: "Opponent still had 5+ pieces",
      amount: 700_000
    });
  }

  return bonuses;
}

function countPlayerPieces(board, playerId) {
  const man = playerId === 1 ? P1 : P2;
  const king = playerId === 1 ? P1_KING : P2_KING;

  return board.reduce(
    (counts, piece) => {
      if (piece === man || piece === king) counts.total += 1;
      if (piece === king) counts.kings += 1;
      return counts;
    },
    { total: 0, kings: 0 }
  );
}

function toResultPlayer(stats, bounty, currentWinStreak, wins, losses) {
  return {
    userId: stats.userId,
    username: stats.username,
    displayName: stats.displayName,
    city: stats.city,
    avatarUrl: stats.avatarUrl,
    bounty,
    wins,
    losses,
    currentWinStreak,
    bestWinStreak: Math.max(stats.bestWinStreak, currentWinStreak),
    tier: getBountyTier(bounty)
  };
}
