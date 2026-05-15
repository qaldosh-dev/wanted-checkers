import { query } from "./db.js";

const MVP_PLAYERS = [
  { playerId: 1, displayName: "Player 1" },
  { playerId: 2, displayName: "Player 2" }
];

export async function ensureMvpPlayerStats(options = {}) {
  const executor = options.client ?? { query };

  for (const player of MVP_PLAYERS) {
    await executor.query(
      `INSERT INTO player_stats (player_id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (player_id) DO NOTHING`,
      [player.playerId, player.displayName]
    );
  }
}

export async function findPlayerStatsByIds(playerIds, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT player_id,
            display_name,
            bounty,
            wins,
            losses,
            current_win_streak,
            best_win_streak,
            tier
     FROM player_stats
     WHERE player_id = ANY($1::int[])
     ORDER BY player_id ASC
     FOR UPDATE`,
    [playerIds]
  );

  return result.rows.map(mapPlayerStatsRow);
}

export async function listPlayerStats(options = {}) {
  const executor = options.client ?? { query };
  await ensureMvpPlayerStats(options);

  const result = await executor.query(
    `SELECT player_id,
            display_name,
            bounty,
            wins,
            losses,
            current_win_streak,
            best_win_streak,
            tier
     FROM player_stats
     ORDER BY bounty DESC, wins DESC, player_id ASC`
  );

  return result.rows.map(mapPlayerStatsRow);
}

export async function updatePlayerStats(stats, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `UPDATE player_stats
     SET bounty = $2,
         wins = $3,
         losses = $4,
         current_win_streak = $5,
         best_win_streak = $6,
         tier = $7,
         updated_at = NOW()
     WHERE player_id = $1
     RETURNING player_id,
               display_name,
               bounty,
               wins,
               losses,
               current_win_streak,
               best_win_streak,
               tier`,
    [
      stats.playerId,
      stats.bounty,
      stats.wins,
      stats.losses,
      stats.currentWinStreak,
      stats.bestWinStreak,
      stats.tier
    ]
  );

  return mapPlayerStatsRow(result.rows[0]);
}

export function mapPlayerStatsRow(row) {
  return {
    playerId: row.player_id,
    displayName: row.display_name,
    bounty: Number(row.bounty),
    wins: row.wins,
    losses: row.losses,
    currentWinStreak: row.current_win_streak,
    bestWinStreak: row.best_win_streak,
    tier: row.tier
  };
}
