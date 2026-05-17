import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildDashboard } from "../src/playerStatsDashboard.js";

const ranking = {
  userId: 7,
  wins: 3,
  losses: 1,
  currentWinStreak: 2,
  bestWinStreak: 3,
  bounty: 2_500_000,
  tier: "Rookie Threat",
  nationalRank: 4,
  regionalRank: 1,
  city: "Almaty",
  isRegionalChampion: true,
  isNationalChampion: false,
  prestigeLabel: "MOST WANTED OF ALMATY"
};

test("stats dashboard aggregates modes, AI, bounty, ranks, and recent form", () => {
  const dashboard = buildDashboard(7, ranking, [
    row({ mode: "vs_ai", aiDifficulty: "beginner", winnerUserId: 7, bountyGain: 1_000_000 }),
    row({ mode: "multiplayer", loserUserId: 7, bountyLoss: 250_000 }),
    row({ mode: "blitz", result: { draw: true } }),
    row({ mode: "blind_hunt", winnerUserId: 7, bountyGain: 1_500_000 })
  ]);

  assert.equal(dashboard.core.totalGames, 4);
  assert.equal(dashboard.core.wins, 2);
  assert.equal(dashboard.core.losses, 1);
  assert.equal(dashboard.core.draws, 1);
  assert.equal(dashboard.core.winRate, 50);
  assert.equal(dashboard.byMode.vsAI.wins, 1);
  assert.equal(dashboard.byMode.multiplayer.losses, 1);
  assert.equal(dashboard.byMode.blitz.draws, 1);
  assert.equal(dashboard.byMode.blindHunt.wins, 1);
  assert.equal(dashboard.aiStats.beginnerAI.wins, 1);
  assert.equal(dashboard.bounty.totalBountyGained, 2_500_000);
  assert.equal(dashboard.bounty.totalBountyLost, 250_000);
  assert.equal(dashboard.bounty.highestBountyGain, 1_500_000);
  assert.equal(dashboard.ranks.isRegionalChampion, true);
  assert.deepEqual(dashboard.recentPerformance.results, ["W", "D", "L", "W"]);
});

test("stats dashboard falls back to player_stats when no match rows exist", () => {
  const dashboard = buildDashboard(7, ranking, []);

  assert.equal(dashboard.core.totalGames, 4);
  assert.equal(dashboard.core.wins, 3);
  assert.equal(dashboard.core.losses, 1);
  assert.equal(dashboard.core.draws, 0);
  assert.equal(dashboard.core.winRate, 75);
  assert.equal(dashboard.bounty.totalBountyGained, 0);
  assert.deepEqual(dashboard.recentPerformance.results, []);
});

function row(overrides = {}) {
  return {
    match_id: randomUUID(),
    winner_user_id: overrides.winnerUserId ?? null,
    loser_user_id: overrides.loserUserId ?? null,
    bounty_gain: overrides.bountyGain ?? 0,
    bounty_loss: overrides.bountyLoss ?? 0,
    result: overrides.result ?? {},
    created_at: new Date().toISOString(),
    mode: overrides.mode ?? "local_pvp",
    ai_difficulty: overrides.aiDifficulty ?? null,
    player_one_user_id: 7,
    player_two_user_id: overrides.mode === "vs_ai" ? null : 9,
    status: overrides.result?.draw ? "draw" : "finished",
    winner: overrides.winnerUserId === 7 ? 1 : 2
  };
}
