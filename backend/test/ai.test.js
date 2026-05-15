import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY,
  P1,
  P2,
  createInitialState,
  getLegalMoves,
  indexFromRowCol
} from "../src/engine/checkers.js";
import {
  applyAiTurn,
  chooseAiMove
} from "../src/ai/aiEngine.js";

function emptyBoard() {
  return Array(32).fill(EMPTY);
}

function idx(row, col) {
  return indexFromRowCol(row, col);
}

test("beginner AI returns a legal move", () => {
  const state = { ...createInitialState(), currentTurn: 2 };
  const move = chooseAiMove(state, "beginner");
  const legalMoves = getLegalMoves(state);

  assert.ok(legalMoves.some((legalMove) => legalMove.from === move.from && legalMove.to === move.to));
});

test("intermediate AI prefers promotion when no capture is forced", () => {
  const board = emptyBoard();
  board[idx(6, 1)] = P2;
  board[idx(2, 1)] = P2;
  board[idx(5, 6)] = P1;

  const move = chooseAiMove(
    { board, currentTurn: 2, forcedFrom: null, status: "ongoing", winner: null },
    "intermediate"
  );

  assert.equal(move.from, idx(6, 1));
  assert.ok([idx(7, 0), idx(7, 2)].includes(move.to));
});

test("expert AI returns a legal move", () => {
  const state = { ...createInitialState(), currentTurn: 2 };
  const move = chooseAiMove(state, "expert");
  const legalMoves = getLegalMoves(state);

  assert.ok(legalMoves.some((legalMove) => legalMove.from === move.from && legalMove.to === move.to));
});

test("AI turn continues forced multi-jump sequences", () => {
  const board = emptyBoard();
  board[idx(2, 1)] = P2;
  board[idx(3, 2)] = P1;
  board[idx(5, 4)] = P1;
  board[idx(7, 6)] = P1;

  const result = applyAiTurn(
    { board, currentTurn: 2, forcedFrom: null, status: "ongoing", winner: null },
    "intermediate"
  );

  assert.equal(result.moves.length, 2);
  assert.equal(result.state.currentTurn, 1);
});
