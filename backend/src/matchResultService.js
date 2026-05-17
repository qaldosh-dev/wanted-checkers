import {
  buildUpdatedLoserStats,
  buildUpdatedWinnerStats,
  calculateBountyResult
} from "./bounty/bountyService.js";
import { query, withTransaction } from "./db.js";
import { updateGameRecord } from "./gameRepository.js";
import {
  findPlayerStatsByUserId,
  findPlayerStatsByUserIds,
  updatePlayerStats
} from "./playerStatsRepository.js";

export async function completeMatchWithBounty(game, state, dependencies = {}) {
  const persistGame = dependencies.updateGameRecord ?? updateGameRecord;

  if (state.status === "draw") {
    return completeDrawMatch(game, state, persistGame);
  }

  if (state.status !== "finished" || !state.winner) {
    return persistGame(game.gameId, state);
  }

  if (game.mode === "vs_ai") {
    if (state.winner === 1 && game.playerOneUserId) {
      return completeHumanVsAiWin(game, state, persistGame);
    }

    const matchResult = buildLocalMatchResult(
      state.winner,
      "AI opponent game: bounty updates are only awarded when the human wins."
    );
    return withTransaction(async (client) => {
      if (isIntegerUserId(game.playerOneUserId)) {
        await createMatchRecord(game.gameId, null, game.playerOneUserId, matchResult, { client });
      }
      return persistGame(
        game.gameId,
        {
          ...state,
          matchResult
        },
        { client, matchResult }
      );
    });
  }

  if (!game.playerOneUserId || !game.playerTwoUserId) {
    const matchResult = buildLocalMatchResult(state.winner);
    return withTransaction(async (client) => {
      if (isIntegerUserId(game.playerOneUserId)) {
        await createMatchRecord(
          game.gameId,
          state.winner === 1 ? game.playerOneUserId : null,
          state.winner === 1 ? null : game.playerOneUserId,
          matchResult,
          { client }
        );
      }
      return persistGame(
        game.gameId,
        {
          ...state,
          matchResult
        },
        { client, matchResult }
      );
    });
  }

  return withTransaction(async (client) => {
    const winnerUserId = state.winner === 1 ? game.playerOneUserId : game.playerTwoUserId;
    const loserUserId = state.winner === 1 ? game.playerTwoUserId : game.playerOneUserId;

    const playerStats = await findPlayerStatsByUserIds([winnerUserId, loserUserId], {
      client,
      forUpdate: true
    });
    const winnerStats = playerStats.find((stats) => stats.userId === winnerUserId);
    const loserStats = playerStats.find((stats) => stats.userId === loserUserId);

    if (!winnerStats || !loserStats) {
      throw new Error("Player stats are missing for match finalization.");
    }

    const matchResult = calculateBountyResult({
      board: state.board,
      winner: state.winner,
      winnerStats,
      loserStats
    });

    await updatePlayerStats(buildUpdatedWinnerStats(winnerStats, matchResult), { client });
    await updatePlayerStats(buildUpdatedLoserStats(loserStats, matchResult), { client });
    await createMatchRecord(game.gameId, winnerUserId, loserUserId, matchResult, { client });

    return persistGame(
      game.gameId,
      {
        ...state,
        matchResult
      },
      { client, matchResult }
    );
  });
}

async function completeDrawMatch(game, state, persistGame) {
  const matchResult = buildDrawMatchResult(state.drawReason);
  const shouldStoreMatch = isIntegerUserId(game.playerOneUserId);

  if (!shouldStoreMatch) {
    return persistGame(
      game.gameId,
      {
        ...state,
        matchResult
      },
      { matchResult }
    );
  }

  return withTransaction(async (client) => {
    await createMatchRecord(game.gameId, null, null, matchResult, { client });
    return persistGame(
      game.gameId,
      {
        ...state,
        matchResult
      },
      { client, matchResult }
    );
  });
}

async function completeHumanVsAiWin(game, state, persistGame) {
  return withTransaction(async (client) => {
    const winnerStats = await findPlayerStatsByUserId(game.playerOneUserId, { client });
    if (!winnerStats) throw new Error("Player stats are missing for AI match finalization.");

    const aiStats = {
      userId: null,
      username: "ai_opponent",
      displayName: `AI ${game.aiDifficulty ?? "beginner"}`,
      city: "Clockwork Cove",
      avatarUrl: null,
      bounty: 0,
      wins: 0,
      losses: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      tier: "Unknown"
    };
    const matchResult = {
      ...calculateBountyResult({
        board: state.board,
        winner: 1,
        winnerStats,
        loserStats: aiStats
      }),
      aiMatch: true,
      aiDifficulty: game.aiDifficulty ?? "beginner"
    };

    await updatePlayerStats(buildUpdatedWinnerStats(winnerStats, matchResult), { client });
    await createMatchRecord(game.gameId, game.playerOneUserId, null, matchResult, { client });

    return persistGame(
      game.gameId,
      {
        ...state,
        matchResult
      },
      { client, matchResult }
    );
  });
}

function buildLocalMatchResult(winner, message = "Local Player 2 game: bounty updates are disabled until real matchmaking is added.") {
  return {
    winner,
    loser: winner === 1 ? 2 : 1,
    bountyGain: 0,
    bountyLoss: 0,
    winnerNewBounty: null,
    loserNewBounty: null,
    winnerTier: null,
    loserTier: null,
    streakMultiplier: 1,
    bonusesApplied: [],
    localOnly: true,
    message
  };
}

function buildDrawMatchResult(drawReason) {
  return {
    draw: true,
    drawReason: drawReason ?? "unknown",
    winner: null,
    loser: null,
    bountyGain: 0,
    bountyLoss: 0,
    winnerNewBounty: null,
    loserNewBounty: null,
    winnerTier: null,
    loserTier: null,
    streakMultiplier: 1,
    bonusesApplied: [],
    message: "NO PLAYER COULD CLAIM THE BOUNTY"
  };
}

async function createMatchRecord(gameId, winnerUserId, loserUserId, result, options) {
  const executor = options.client ?? { query };
  await executor.query(
    `INSERT INTO matches (
       game_id,
       winner_user_id,
       loser_user_id,
       bounty_gain,
       bounty_loss,
       result
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      gameId,
      winnerUserId,
      loserUserId,
      result.bountyGain,
      result.bountyLoss,
      JSON.stringify(result)
    ]
  );
}

function isIntegerUserId(userId) {
  return Number.isInteger(userId);
}
