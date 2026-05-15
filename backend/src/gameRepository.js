import { query } from "./db.js";

export async function createGameRecord(state) {
  const result = await query(
    `INSERT INTO games (board, current_turn, forced_from, status, winner)
     VALUES ($1::jsonb, $2, $3, $4, $5)
     RETURNING id, board, current_turn, forced_from, status, winner, created_at`,
    [
      JSON.stringify(state.board),
      state.currentTurn,
      state.forcedFrom,
      state.status,
      state.winner
    ]
  );

  return mapGameRow(result.rows[0]);
}

export async function findGameRecord(gameId) {
  const result = await query(
    `SELECT id, board, current_turn, forced_from, status, winner, created_at
     FROM games
     WHERE id = $1`,
    [gameId]
  );

  if (result.rowCount === 0) return null;
  return mapGameRow(result.rows[0]);
}

export async function updateGameRecord(gameId, state) {
  const result = await query(
    `UPDATE games
     SET board = $2::jsonb,
         current_turn = $3,
         forced_from = $4,
         status = $5,
         winner = $6
     WHERE id = $1
     RETURNING id, board, current_turn, forced_from, status, winner, created_at`,
    [
      gameId,
      JSON.stringify(state.board),
      state.currentTurn,
      state.forcedFrom,
      state.status,
      state.winner
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
    createdAt: row.created_at
  };
}
