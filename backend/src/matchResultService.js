import {
  buildUpdatedLoserStats,
  buildUpdatedWinnerStats,
  calculateBountyResult
} from "./bounty/bountyService.js";
import { withTransaction } from "./db.js";
import { updateGameRecord } from "./gameRepository.js";
import {
  ensureMvpPlayerStats,
  findPlayerStatsByIds,
  updatePlayerStats
} from "./playerStatsRepository.js";

export async function completeMatchWithBounty(gameId, state) {
  if (state.status !== "finished" || !state.winner) {
    return updateGameRecord(gameId, state);
  }

  return withTransaction(async (client) => {
    await ensureMvpPlayerStats({ client });

    const winnerId = state.winner;
    const loserId = winnerId === 1 ? 2 : 1;
    const playerStats = await findPlayerStatsByIds([winnerId, loserId], { client });
    const winnerStats = playerStats.find((stats) => stats.playerId === winnerId);
    const loserStats = playerStats.find((stats) => stats.playerId === loserId);

    if (!winnerStats || !loserStats) {
      throw new Error("MVP player stats are missing.");
    }

    const matchResult = calculateBountyResult({
      board: state.board,
      winner: winnerId,
      winnerStats,
      loserStats
    });

    await updatePlayerStats(buildUpdatedWinnerStats(winnerStats, matchResult), { client });
    await updatePlayerStats(buildUpdatedLoserStats(loserStats, matchResult), { client });

    return updateGameRecord(
      gameId,
      {
        ...state,
        matchResult
      },
      { client, matchResult }
    );
  });
}
