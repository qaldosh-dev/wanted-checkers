import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY,
  P1,
  P2,
  P1_KING,
  P2_KING,
  createInitialBoard,
  createInitialState,
  applyMove,
  getLegalMoves,
  getLegalMovesFrom,
  indexFromRowCol,
  isNoProgressDraw,
  isRepeatedPosition
} from "../src/engine/checkers.js";

function emptyBoard() {
  return Array(32).fill(EMPTY);
}

function idx(row, col) {
  return indexFromRowCol(row, col);
}

test("initial board uses 32 playable squares with player 1 moving first", () => {
  const state = createInitialState();

  assert.equal(state.board.length, 32);
  assert.equal(state.currentTurn, 1);
  assert.equal(state.board.filter((piece) => piece === P1).length, 12);
  assert.equal(state.board.filter((piece) => piece === P2).length, 12);
  assert.equal(getLegalMoves(state).length, 7);
});

test("forced capture blocks quiet moves", () => {
  const board = emptyBoard();
  board[idx(5, 0)] = P1;
  board[idx(4, 1)] = P2;
  board[idx(5, 4)] = P1;

  const state = { board, currentTurn: 1, forcedFrom: null, status: "ongoing" };
  const legalMoves = getLegalMoves(state);

  assert.deepEqual(
    legalMoves.map((move) => [move.from, move.to, move.capture]),
    [[idx(5, 0), idx(3, 2), idx(4, 1)]]
  );
  assert.throws(() => applyMove(state, { from: idx(5, 4), to: idx(4, 3) }), /Illegal move/);
});

test("multi-jump capture keeps turn and forces same piece to continue", () => {
  const board = emptyBoard();
  board[idx(5, 0)] = P1;
  board[idx(4, 1)] = P2;
  board[idx(2, 3)] = P2;
  board[idx(0, 1)] = P2;
  board[idx(5, 4)] = P1;
  board[idx(4, 5)] = P2;

  const afterFirstJump = applyMove(
    { board, currentTurn: 1, forcedFrom: null, status: "ongoing" },
    { from: idx(5, 0), to: idx(3, 2) }
  );

  assert.equal(afterFirstJump.currentTurn, 1);
  assert.equal(afterFirstJump.forcedFrom, idx(3, 2));
  assert.deepEqual(
    getLegalMovesFrom(afterFirstJump, idx(3, 2)).map((move) => move.to),
    [idx(1, 4)]
  );
  assert.throws(() => applyMove(afterFirstJump, { from: idx(5, 4), to: idx(3, 6) }), /Illegal move/);

  const afterSecondJump = applyMove(afterFirstJump, { from: idx(3, 2), to: idx(1, 4) });
  assert.equal(afterSecondJump.currentTurn, 2);
  assert.equal(afterSecondJump.forcedFrom, null);
});

test("regular pieces move only forward but can capture backward", () => {
  const board = emptyBoard();
  board[idx(3, 2)] = P1;
  board[idx(4, 3)] = P2;
  board[idx(5, 6)] = P1;

  const state = { board, currentTurn: 1, forcedFrom: null, status: "ongoing" };
  const legalMoves = getLegalMoves(state);

  assert.deepEqual(
    legalMoves.map((move) => [move.from, move.to, move.capture]),
    [[idx(3, 2), idx(5, 4), idx(4, 3)]]
  );
  assert.throws(() => applyMove(state, { from: idx(3, 2), to: idx(2, 1) }), /Illegal move/);
  assert.throws(() => applyMove(state, { from: idx(5, 6), to: idx(6, 5) }), /Illegal move/);
});

test("regular pieces can continue multi-jumps with backward captures", () => {
  const board = emptyBoard();
  board[idx(5, 0)] = P1;
  board[idx(4, 1)] = P2;
  board[idx(4, 3)] = P2;

  const afterForwardCapture = applyMove(
    { board, currentTurn: 1, forcedFrom: null, status: "ongoing" },
    { from: idx(5, 0), to: idx(3, 2) }
  );

  assert.equal(afterForwardCapture.currentTurn, 1);
  assert.equal(afterForwardCapture.forcedFrom, idx(3, 2));
  assert.deepEqual(
    getLegalMovesFrom(afterForwardCapture, idx(3, 2)).map((move) => [move.to, move.capture]),
    [[idx(5, 4), idx(4, 3)]]
  );

  const afterBackwardCapture = applyMove(afterForwardCapture, {
    from: idx(3, 2),
    to: idx(5, 4)
  });

  assert.equal(afterBackwardCapture.status, "finished");
  assert.equal(afterBackwardCapture.winner, 1);
});

test("pieces promote to kings on the last row", () => {
  const board = emptyBoard();
  board[idx(1, 2)] = P1;
  board[idx(2, 5)] = P2;

  const nextState = applyMove(
    { board, currentTurn: 1, forcedFrom: null, status: "ongoing" },
    { from: idx(1, 2), to: idx(0, 1) }
  );

  assert.equal(nextState.board[idx(0, 1)], P1_KING);
  assert.equal(nextState.currentTurn, 2);
});

test("flying kings can move any distance diagonally through empty squares", () => {
  const board = emptyBoard();
  board[idx(3, 2)] = P1_KING;

  const state = { board, currentTurn: 1, forcedFrom: null, status: "ongoing" };
  const destinations = getLegalMoves(state)
    .map((move) => move.to)
    .sort((a, b) => a - b);

  assert.deepEqual(
    destinations,
    [
      idx(0, 5),
      idx(1, 0),
      idx(1, 4),
      idx(2, 1),
      idx(2, 3),
      idx(4, 1),
      idx(4, 3),
      idx(5, 0),
      idx(5, 4),
      idx(6, 5),
      idx(7, 6)
    ].sort((a, b) => a - b)
  );
});

test("flying kings capture from distance and can land beyond captured pieces", () => {
  const board = emptyBoard();
  board[idx(5, 0)] = P1_KING;
  board[idx(3, 2)] = P2;
  board[idx(0, 5)] = P1;

  const state = { board, currentTurn: 1, forcedFrom: null, status: "ongoing" };
  const legalMoves = getLegalMoves(state);

  assert.deepEqual(
    legalMoves.map((move) => [move.from, move.to, move.capture]).sort(),
    [
      [idx(5, 0), idx(2, 3), idx(3, 2)],
      [idx(5, 0), idx(1, 4), idx(3, 2)]
    ].sort()
  );
});

test("flying kings continue multi-capture sequences", () => {
  const board = emptyBoard();
  board[idx(5, 0)] = P1_KING;
  board[idx(3, 2)] = P2;
  board[idx(1, 4)] = P2;

  const afterFirstCapture = applyMove(
    { board, currentTurn: 1, forcedFrom: null, status: "ongoing" },
    { from: idx(5, 0), to: idx(2, 3) }
  );

  assert.equal(afterFirstCapture.currentTurn, 1);
  assert.equal(afterFirstCapture.forcedFrom, idx(2, 3));
  assert.deepEqual(
    getLegalMovesFrom(afterFirstCapture, idx(2, 3)).map((move) => [move.to, move.capture]),
    [[idx(0, 5), idx(1, 4)]]
  );

  const afterSecondCapture = applyMove(afterFirstCapture, {
    from: idx(2, 3),
    to: idx(0, 5)
  });

  assert.equal(afterSecondCapture.status, "finished");
  assert.equal(afterSecondCapture.winner, 1);
});

test("game finishes when opponent has no pieces", () => {
  const board = emptyBoard();
  board[idx(5, 0)] = P1;
  board[idx(4, 1)] = P2;

  const nextState = applyMove(
    { board, currentTurn: 1, forcedFrom: null, status: "ongoing" },
    { from: idx(5, 0), to: idx(3, 2) }
  );

  assert.equal(nextState.status, "finished");
  assert.equal(nextState.winner, 1);
});

test("game finishes when opponent has no legal moves", () => {
  const board = emptyBoard();
  board[idx(1, 0)] = P1;
  board[idx(1, 2)] = P1;
  board[idx(2, 3)] = P1;
  board[idx(0, 1)] = P2;
  board[idx(5, 0)] = P1;

  const nextState = applyMove(
    { board, currentTurn: 1, forcedFrom: null, status: "ongoing" },
    { from: idx(5, 0), to: idx(4, 1) }
  );

  assert.equal(nextState.status, "finished");
  assert.equal(nextState.winner, 1);
});

test("threefold repetition ends the game as a draw", () => {
  const board = emptyBoard();
  board[idx(5, 0)] = P1_KING;
  board[idx(2, 7)] = P2_KING;
  let state = {
    board,
    currentTurn: 1,
    forcedFrom: null,
    status: "ongoing",
    winner: null,
    movesWithoutProgress: 0,
    positionCounts: {}
  };

  for (const [from, to] of [
    [idx(5, 0), idx(4, 1)],
    [idx(2, 7), idx(3, 6)],
    [idx(4, 1), idx(5, 0)],
    [idx(3, 6), idx(2, 7)],
    [idx(5, 0), idx(4, 1)],
    [idx(2, 7), idx(3, 6)],
    [idx(4, 1), idx(5, 0)],
    [idx(3, 6), idx(2, 7)]
  ]) {
    state = applyMove(state, { from, to });
  }

  assert.equal(state.status, "draw");
  assert.equal(state.winner, null);
  assert.equal(state.drawReason, "threefold_repetition");
  assert.equal(isRepeatedPosition(state), true);
});

test("30 moves without capture or promotion ends the game as a draw", () => {
  const board = emptyBoard();
  board[idx(5, 0)] = P1_KING;
  board[idx(2, 7)] = P2_KING;

  const state = applyMove(
    {
      board,
      currentTurn: 1,
      forcedFrom: null,
      status: "ongoing",
      winner: null,
      movesWithoutProgress: 29,
      positionCounts: {}
    },
    { from: idx(5, 0), to: idx(4, 1) }
  );

  assert.equal(state.status, "draw");
  assert.equal(state.winner, null);
  assert.equal(state.drawReason, "no_progress");
  assert.equal(isNoProgressDraw(state), true);
});

test("initial board helper matches expected setup", () => {
  const board = createInitialBoard();

  assert.deepEqual(board.slice(0, 12), Array(12).fill(P2));
  assert.deepEqual(board.slice(12, 20), Array(8).fill(EMPTY));
  assert.deepEqual(board.slice(20), Array(12).fill(P1));
});
