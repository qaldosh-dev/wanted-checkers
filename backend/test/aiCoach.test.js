import test from "node:test";
import assert from "node:assert/strict";
import { analyzeReplayLocally } from "../src/aiCoach/heuristicAnalyzer.js";

test("AI Coach local analyzer detects direct tactical blunders from snapshots", () => {
  const before = emptyBoard();
  before[idx(5, 2)] = 1;
  before[idx(3, 2)] = 2;

  const after = emptyBoard();
  after[idx(4, 1)] = 1;
  after[idx(3, 2)] = 2;

  const replay = {
    players: {
      playerOne: { userId: 7 },
      playerTwo: { userId: 8 }
    },
    initialBoard: before,
    moves: [
      {
        moveNumber: 1,
        type: "move",
        player: 1,
        from: idx(5, 2),
        to: idx(4, 1),
        capture: null,
        capturedSquares: [],
        promoted: false,
        boardAfter: after,
        currentTurnAfter: 2,
        forcedFromAfter: null,
        statusAfter: "ongoing"
      }
    ]
  };

  const analysis = analyzeReplayLocally(replay, 7);

  assert.equal(analysis.perspectivePlayer, 1);
  assert.ok(analysis.insights.some((insight) => insight.type === "tactical_blunder"));
  const blunder = analysis.insights.find((insight) => insight.type === "tactical_blunder");
  assert.equal(blunder.step, 1);
  assert.deepEqual(blunder.boardSnapshot, after);
});

function emptyBoard() {
  return Array(32).fill(0);
}

function idx(row, col) {
  return row * 4 + Math.floor(col / 2);
}
