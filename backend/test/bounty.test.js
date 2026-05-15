import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY,
  P1,
  P1_KING,
  P2
} from "../src/engine/checkers.js";
import {
  calculateBountyResult,
  getBountyTier
} from "../src/bounty/bountyService.js";

function emptyBoard() {
  return Array(32).fill(EMPTY);
}

function stats(playerNumber, overrides = {}) {
  return {
    userId: `00000000-0000-0000-0000-00000000000${playerNumber}`,
    username: `player${playerNumber}`,
    displayName: `Player ${playerNumber}`,
    bounty: 0,
    wins: 0,
    losses: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    tier: "Unknown",
    ...overrides
  };
}

test("bounty result applies base win and loser penalty", () => {
  const board = emptyBoard();
  board[20] = P1;

  const result = calculateBountyResult({
    board,
    winner: 1,
    winnerStats: stats(1),
    loserStats: stats(2, { bounty: 500_000 })
  });

  assert.equal(result.winner, 1);
  assert.equal(result.loser, 2);
  assert.equal(result.bountyGain, 1_000_000);
  assert.equal(result.bountyLoss, 250_000);
  assert.equal(result.winnerNewBounty, 1_000_000);
  assert.equal(result.loserNewBounty, 250_000);
  assert.equal(result.winnerTier, "Rookie Threat");
});

test("bounty result applies streak multiplier and bonuses", () => {
  const board = emptyBoard();
  board[2] = P1_KING;
  board[10] = P1;
  board[11] = P1;
  board[12] = P1;
  board[13] = P1;
  board[14] = P1;
  board[15] = P1;
  board[16] = P1;
  board[17] = P1;
  board[18] = P2;
  board[19] = P2;
  board[21] = P2;
  board[22] = P2;
  board[23] = P2;

  const result = calculateBountyResult({
    board,
    winner: 1,
    winnerStats: stats(1, { bounty: 8_000_000, wins: 1, currentWinStreak: 1 }),
    loserStats: stats(2, { bounty: 3_000_000 })
  });

  assert.equal(result.streakMultiplier, 1.5);
  assert.equal(result.bountyGain, 3_750_000);
  assert.equal(result.winnerNewBounty, 11_750_000);
  assert.equal(result.winnerTier, "Rising Menace");
  assert.deepEqual(
    result.bonusesApplied.map((bonus) => bonus.code),
    ["PIECE_ADVANTAGE", "KING_STANDING", "LIVE_ARMY_WIN"]
  );
});

test("bounty tiers cover all MVP ranges", () => {
  assert.equal(getBountyTier(0), "Unknown");
  assert.equal(getBountyTier(1_000_000), "Rookie Threat");
  assert.equal(getBountyTier(10_000_000), "Rising Menace");
  assert.equal(getBountyTier(50_000_000), "Dangerous");
  assert.equal(getBountyTier(100_000_000), "Notorious");
  assert.equal(getBountyTier(300_000_000), "Warlord");
  assert.equal(getBountyTier(600_000_000), "Emperor");
});
