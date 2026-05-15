import {
  buildUpdatedLoserStats,
  buildUpdatedWinnerStats,
  calculateBountyResult
} from "./bounty/bountyService.js";
import { query, withTransaction } from "./db.js";
import { updateGameRecord } from "./gameRepository.js";
import {
  findPlayerStatsByUserIds,
  updatePlayerStats
} from "./playerStatsRepository.js";

export async function completeMatchWithBounty(game, state, dependencies = {}) {
  const persistGame = dependencies.updateGameRecord ?? updateGameRecord;

  if (state.status !== "finished" || !state.winner) {
    return persistGame(game.gameId, state);
  }

  if (!game.playerOneUserId || !game.playerTwoUserId) {
    const matchResult = buildLocalMatchResult(state.winner);
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

function buildLocalMatchResult(winner) {
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
    message: "Local Player 2 game: bounty updates are disabled until real matchmaking is added."
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
