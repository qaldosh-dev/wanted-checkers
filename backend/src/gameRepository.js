import { query } from "./db.js";

export async function createGameRecord(state, players = {}) {
  const result = await query(
    `INSERT INTO games (
       board,
       current_turn,
       forced_from,
       status,
       winner,
       player_one_user_id,
       player_two_user_id,
       mode,
       ai_difficulty
     )
     VALUES ($1::jsonb, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id,
               board,
               current_turn,
               forced_from,
               status,
               winner,
               player_one_user_id,
               player_two_user_id,
               mode,
               ai_difficulty,
               match_result,
               created_at`,
    [
      JSON.stringify(state.board),
      state.currentTurn,
      state.forcedFrom,
      state.status,
      state.winner,
      players.playerOneUserId,
      players.playerTwoUserId,
      players.mode ?? "local_pvp",
      players.aiDifficulty ?? null
    ]
  );

  return mapGameRow(result.rows[0]);
}

export async function findGameRecord(gameId) {
  const result = await query(
    `SELECT id,
            board,
            current_turn,
            forced_from,
            status,
            winner,
            player_one_user_id,
            player_two_user_id,
            mode,
            ai_difficulty,
            match_result,
            created_at
     FROM games
     WHERE id = $1`,
    [gameId]
  );

  if (result.rowCount === 0) return null;
  return mapGameRow(result.rows[0]);
}

export async function updateGameRecord(gameId, state, options = {}) {
  const executor = options.client ?? { query };
  const matchResult = state.matchResult ?? options.matchResult ?? null;
  const result = await executor.query(
    `UPDATE games
     SET board = $2::jsonb,
         current_turn = $3,
         forced_from = $4,
         status = $5,
         winner = $6,
         match_result = $7::jsonb
     WHERE id = $1
     RETURNING id,
               board,
               current_turn,
               forced_from,
               status,
               winner,
               player_one_user_id,
               player_two_user_id,
               mode,
               ai_difficulty,
               match_result,
               created_at`,
    [
      gameId,
      JSON.stringify(state.board),
      state.currentTurn,
      state.forcedFrom,
      state.status,
      state.winner,
      matchResult ? JSON.stringify(matchResult) : null
    ]
  );

  if (result.rowCount === 0) return null;
  return mapGameRow(result.rows[0]);
}

export function mapGameRow(row) {
  return {
    gameId: row.id,
    board: row.board,
    currentTurn: row.current_turn,
    forcedFrom: row.forced_from,
    status: row.status,
    winner: row.winner,
    playerOneUserId: row.player_one_user_id,
    playerTwoUserId: row.player_two_user_id,
    mode: row.mode ?? "local_pvp",
    aiDifficulty: row.ai_difficulty,
    matchResult: row.match_result,
    createdAt: row.created_at
  };
}
