import {
  EMPTY,
  P1,
  P2,
  P1_KING,
  P2_KING,
  applyMove,
  getLegalMoves,
  rowColFromIndex
} from "../engine/checkers.js";

const AI_PLAYER = 2;
const HUMAN_PLAYER = 1;
const EXPERT_DEPTH = 4;

export function chooseAiMove(state, difficulty = "beginner") {
  const moves = getLegalMoves(state);
  if (moves.length === 0) return null;

  if (difficulty === "expert") return chooseExpertMove(state, moves);
  if (difficulty === "intermediate") return chooseIntermediateMove(state, moves);
  return randomMove(moves);
}

export function applyAiTurn(state, difficulty = "beginner") {
  let nextState = state;
  const moves = [];

  while (nextState.status === "ongoing" && nextState.currentTurn === AI_PLAYER) {
    const move = chooseAiMove(nextState, difficulty);
    if (!move) break;
    moves.push(move);
    nextState = applyMove(nextState, move);
  }

  return { state: nextState, moves };
}

function chooseIntermediateMove(state, moves) {
  const scoredMoves = moves.map((move) => ({
    move,
    score: scoreIntermediateMove(state, move)
  }));
  const bestScore = Math.max(...scoredMoves.map((entry) => entry.score));
  return randomMove(scoredMoves.filter((entry) => entry.score === bestScore).map((entry) => entry.move));
}

function scoreIntermediateMove(state, move) {
  let score = 0;
  if (move.capture !== null) score += 100;
  if (promotesPiece(state.board, move, AI_PLAYER)) score += 80;
  if (landsInCenter(move.to)) score += 10;

  const nextState = applyMove(state, move);
  const humanReplies = getLegalMoves({ ...nextState, currentTurn: HUMAN_PLAYER, forcedFrom: null });
  if (humanReplies.some((reply) => reply.capture !== null)) score -= 35;
  if (nextState.currentTurn === AI_PLAYER) score += 45;

  return score;
}

function chooseExpertMove(state, moves) {
  let bestMove = moves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;

  for (const move of moves) {
    const nextState = applyMove(state, move);
    const score = minimax(nextState, EXPERT_DEPTH - 1, alpha, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, bestScore);
  }

  return bestMove;
}

function minimax(state, depth, alpha, beta) {
  if (state.status !== "ongoing" || depth === 0) return evaluateState(state);

  const moves = getLegalMoves(state);
  if (moves.length === 0) return evaluateState(state);

  if (state.currentTurn === AI_PLAYER) {
    let value = -Infinity;
    for (const move of moves) {
      value = Math.max(value, minimax(applyMove(state, move), depth - 1, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    value = Math.min(value, minimax(applyMove(state, move), depth - 1, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function evaluateState(state) {
  if (state.status === "finished") {
    if (state.winner === AI_PLAYER) return 100_000;
    if (state.winner === HUMAN_PLAYER) return -100_000;
  }

  const aiMaterial = evaluateMaterial(state.board, AI_PLAYER);
  const humanMaterial = evaluateMaterial(state.board, HUMAN_PLAYER);
  const aiMoves = getLegalMoves({ ...state, currentTurn: AI_PLAYER, forcedFrom: null });
  const humanMoves = getLegalMoves({ ...state, currentTurn: HUMAN_PLAYER, forcedFrom: null });
  const aiCaptures = aiMoves.filter((move) => move.capture !== null).length;
  const humanCaptures = humanMoves.filter((move) => move.capture !== null).length;

  return (
    aiMaterial.score -
    humanMaterial.score +
    (aiMoves.length - humanMoves.length) * 7 +
    (aiCaptures - humanCaptures) * 35 +
    (aiMaterial.center - humanMaterial.center) * 10 +
    (aiMaterial.promotion - humanMaterial.promotion) * 8
  );
}

function evaluateMaterial(board, player) {
  const man = player === AI_PLAYER ? P2 : P1;
  const king = player === AI_PLAYER ? P2_KING : P1_KING;

  return board.reduce(
    (total, piece, index) => {
      if (piece !== man && piece !== king) return total;

      const { row, col } = rowColFromIndex(index);
      total.score += piece === king ? 175 : 100;
      if (col >= 2 && col <= 5 && row >= 2 && row <= 5) total.center += 1;
      total.promotion += player === AI_PLAYER ? row : 7 - row;
      return total;
    },
    { score: 0, center: 0, promotion: 0 }
  );
}

function promotesPiece(board, move, player) {
  if (player !== AI_PLAYER) return false;
  if (board[move.from] !== P2 || board[move.to] !== EMPTY) return false;
  return rowColFromIndex(move.to).row === 7;
}

function landsInCenter(index) {
  const { row, col } = rowColFromIndex(index);
  return row >= 2 && row <= 5 && col >= 2 && col <= 5;
}

function randomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}
