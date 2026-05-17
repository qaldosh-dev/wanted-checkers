import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceBlitzAfterMove,
  createInitialBlitzState,
  materializeBlitzState
} from "../src/blitz/blitzClock.js";

test("blitz clock deducts active player total time and move time", () => {
  const started = createInitialBlitzState(1_000);
  const state = materializeBlitzState(started, 4_000);

  assert.equal(state.playerClocks[1], 177_000);
  assert.equal(state.playerClocks[2], 180_000);
  assert.equal(state.moveRemainingMs, 7_000);
  assert.equal(state.timedOut, false);
});

test("blitz clock flags timeout when move timer expires", () => {
  const started = createInitialBlitzState(1_000);
  const state = materializeBlitzState(started, 12_000);

  assert.equal(state.timedOut, true);
  assert.equal(state.loser, 1);
  assert.equal(state.winner, 2);
});

test("blitz clock advances to next player after accepted move", () => {
  const started = createInitialBlitzState(1_000);
  const next = advanceBlitzAfterMove(started, 2, 4_000);

  assert.equal(next.activePlayer, 2);
  assert.equal(next.playerClocks[1], 177_000);
  assert.equal(next.playerClocks[2], 180_000);
  assert.equal(next.moveRemainingMs, 10_000);
});
