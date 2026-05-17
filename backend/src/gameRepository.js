import { query } from "./db.js";

export async function createGameRecord(state, players = {}) {
  const result = await query(
    `INSERT INTO games (
       board,
       current_turn,
       forced_from,
       position_counts,
       moves_without_progress,
       status,
       winner,
       player_one_user_id,
       player_two_user_id,
       mode,
       ai_difficulty,
       blitz_state,
       move_history
     )
     VALUES ($1::jsonb, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
     RETURNING id,
               board,
               current_turn,
               forced_from,
               position_counts,
               moves_without_progress,
               status,
               winner,
               player_one_user_id,
               player_two_user_id,
               mode,
               ai_difficulty,
               blitz_state,
               move_history,
               match_result,
               created_at`,
    [
      JSON.stringify(state.board),
      state.currentTurn,
      state.forcedFrom,
      JSON.stringify(state.positionCounts ?? {}),
      state.movesWithoutProgress ?? 0,
      state.status,
      state.winner,
      players.playerOneUserId,
      players.playerTwoUserId,
      players.mode ?? "local_pvp",
      players.aiDifficulty ?? null,
      players.blitzState ? JSON.stringify(players.blitzState) : null,
      JSON.stringify(state.moveHistory ?? [])
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
            position_counts,
            moves_without_progress,
            status,
            winner,
            player_one_user_id,
            player_two_user_id,
            mode,
            ai_difficulty,
            blitz_state,
            move_history,
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
  const moveHistory = state.moveHistory ?? options.moveHistory ?? [];
  const result = await executor.query(
    `UPDATE games
     SET board = $2::jsonb,
         current_turn = $3,
         forced_from = $4,
         position_counts = $5::jsonb,
         moves_without_progress = $6,
         status = $7,
         winner = $8,
         match_result = $9::jsonb,
         move_history = $10::jsonb,
         blitz_state = $11::jsonb
     WHERE id = $1
     RETURNING id,
               board,
               current_turn,
               forced_from,
               position_counts,
               moves_without_progress,
               status,
               winner,
               player_one_user_id,
               player_two_user_id,
               mode,
               ai_difficulty,
               blitz_state,
               move_history,
               match_result,
               created_at`,
    [
      gameId,
      JSON.stringify(state.board),
      state.currentTurn,
      state.forcedFrom,
      JSON.stringify(state.positionCounts ?? {}),
      state.movesWithoutProgress ?? 0,
      state.status,
      state.winner,
      matchResult ? JSON.stringify(matchResult) : null,
      JSON.stringify(moveHistory),
      state.blitzState || options.blitzState ? JSON.stringify(state.blitzState ?? options.blitzState) : null
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
    positionCounts: row.position_counts ?? {},
    movesWithoutProgress: row.moves_without_progress ?? 0,
    status: row.status,
    winner: row.winner,
    playerOneUserId: row.player_one_user_id,
    playerTwoUserId: row.player_two_user_id,
    mode: row.mode ?? "local_pvp",
    aiDifficulty: row.ai_difficulty,
    blitzState: row.blitz_state,
    moveHistory: row.move_history ?? [],
    matchResult: row.match_result,
    createdAt: row.created_at
  };
}
