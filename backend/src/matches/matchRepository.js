import { query } from "../db.js";
import { createInitialBoard } from "../engine/checkers.js";

export async function listRecentMatchesForUser(userId, limit = 3, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `${MATCH_SELECT}
     WHERE g.player_one_user_id = $1
        OR g.player_two_user_id = $1
        OR m.winner_user_id = $1
        OR m.loser_user_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map((row) => mapRecentMatchRow(row, userId));
}

export async function findReplayForUser(matchId, userId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `${MATCH_SELECT}
     WHERE m.id = $1
       AND (
         g.player_one_user_id = $2
         OR g.player_two_user_id = $2
         OR m.winner_user_id = $2
         OR m.loser_user_id = $2
       )
     LIMIT 1`,
    [matchId, userId]
  );

  if (result.rowCount === 0) return null;
  return mapReplayRow(result.rows[0], userId);
}

const MATCH_SELECT = `SELECT m.id AS match_id,
                             m.game_id,
                             m.winner_user_id,
                             m.loser_user_id,
                             m.bounty_gain,
                             m.bounty_loss,
                             m.result,
                             m.created_at AS match_created_at,
                             g.mode,
                             g.ai_difficulty,
                             g.player_one_user_id,
                             g.player_two_user_id,
                             g.move_history,
                             g.board AS final_board,
                             g.status,
                             g.winner,
                             g.created_at AS game_created_at,
                             p1.username AS player_one_username,
                             p1.avatar_url AS player_one_avatar_url,
                             p2.username AS player_two_username,
                             p2.avatar_url AS player_two_avatar_url
                      FROM matches m
                      JOIN games g ON g.id = m.game_id
                      LEFT JOIN users p1 ON p1.id = g.player_one_user_id
                      LEFT JOIN users p2 ON p2.id = g.player_two_user_id`;

function mapRecentMatchRow(row, userId) {
  const result = resolveResult(row, userId);

  return {
    matchId: row.match_id,
    gameId: row.game_id,
    mode: row.mode,
    opponent: opponentLabel(row, userId),
    result,
    bountyChange: bountyChange(row, result),
    bountyGain: Number(row.bounty_gain ?? 0),
    bountyLoss: Number(row.bounty_loss ?? 0),
    createdAt: row.match_created_at,
    duration: null
  };
}

function mapReplayRow(row, userId) {
  const moves = normalizeMoves(row.move_history ?? []);
  const snapshots = [
    createInitialBoard(),
    ...moves.map((move) => move.boardAfter).filter(Boolean)
  ];

  return {
    matchId: row.match_id,
    gameId: row.game_id,
    mode: row.mode,
    opponent: opponentLabel(row, userId),
    result: resolveResult(row, userId),
    initialBoard: createInitialBoard(),
    moves,
    snapshots,
    finalResult: row.result,
    players: {
      playerOne: {
        userId: row.player_one_user_id,
        username: row.player_one_username ?? "Player 1",
        avatarUrl: row.player_one_avatar_url
      },
      playerTwo: playerTwo(row)
    },
    createdAt: row.match_created_at
  };
}

function normalizeMoves(moves) {
  return moves.map((move, index) => ({
    moveNumber: move.moveNumber ?? index + 1,
    type: move.type ?? "move",
    player: move.player,
    from: move.from,
    to: move.to,
    capture: move.capture,
    capturedSquares: move.capturedSquares ?? (move.capture === null || move.capture === undefined ? [] : [move.capture]),
    promoted: Boolean(move.promoted),
    boardAfter: move.boardAfter,
    at: move.at
  }));
}

function playerTwo(row) {
  if (row.mode === "vs_ai") {
    return {
      userId: null,
      username: `AI ${labelDifficulty(row.ai_difficulty)}`,
      avatarUrl: null
    };
  }

  return {
    userId: row.player_two_user_id,
    username: row.player_two_username ?? "Local Player 2",
    avatarUrl: row.player_two_avatar_url
  };
}

function opponentLabel(row, userId) {
  if (row.mode === "vs_ai") return `AI ${labelDifficulty(row.ai_difficulty)}`;
  if (row.player_one_user_id === userId) return row.player_two_username ?? "Local Player 2";
  if (row.player_two_user_id === userId) return row.player_one_username ?? "Player 1";
  return row.player_two_username ?? row.player_one_username ?? "Opponent";
}

function resolveResult(row, userId) {
  if (row.result?.draw || row.status === "draw") return "draw";
  if (row.winner_user_id === userId) return "win";
  if (row.loser_user_id === userId) return "loss";

  if (row.player_one_user_id === userId) {
    return row.winner === 1 ? "win" : "loss";
  }
  if (row.player_two_user_id === userId) {
    return row.winner === 2 ? "win" : "loss";
  }

  return "draw";
}

function bountyChange(row, result) {
  if (result === "win") return Number(row.bounty_gain ?? 0);
  if (result === "loss") return -Number(row.bounty_loss ?? 0);
  return 0;
}

function labelDifficulty(difficulty) {
  const labels = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    expert: "Expert"
  };
  return labels[difficulty] ?? "Beginner";
}
