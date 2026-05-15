import test from "node:test";
import assert from "node:assert/strict";
import { completeMatchWithBounty } from "../src/matchResultService.js";

test("local games finish without requiring Player 2 identity or bounty updates", async () => {
  const game = {
    gameId: "00000000-0000-0000-0000-000000000001",
    playerOneUserId: "00000000-0000-0000-0000-000000000010",
    playerTwoUserId: null
  };
  const state = {
    board: Array(32).fill(0),
    currentTurn: 1,
    forcedFrom: null,
    status: "finished",
    winner: 1
  };

  const updated = await completeMatchWithBounty(game, state, {
    updateGameRecord: async (_gameId, nextState) => nextState
  });

  assert.equal(updated.matchResult.localOnly, true);
  assert.equal(updated.matchResult.bountyGain, 0);
  assert.equal(updated.matchResult.winner, 1);
});
