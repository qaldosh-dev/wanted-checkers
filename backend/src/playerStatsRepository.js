import { query } from "./db.js";

export async function createPlayerStatsForUser(userId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `INSERT INTO player_stats (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING user_id,
               bounty,
               wins,
               losses,
               current_win_streak,
               best_win_streak,
               tier`,
    [userId]
  );

  if (result.rowCount === 0) return findPlayerStatsByUserId(userId, options);
  return mapPlayerStatsRow(result.rows[0]);
}

export async function findPlayerStatsByUserId(userId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ps.user_id,
            u.username,
            u.first_name,
            u.last_name,
            u.city,
            u.avatar_url,
            ps.bounty,
            ps.wins,
            ps.losses,
            ps.current_win_streak,
            ps.best_win_streak,
            ps.tier
     FROM player_stats ps
     JOIN users u ON u.id = ps.user_id
     WHERE ps.user_id = $1`,
    [userId]
  );

  if (result.rowCount === 0) return null;
  return mapPlayerStatsRow(result.rows[0]);
}

export async function findPlayerStatsByUserIds(userIds, options = {}) {
  const executor = options.client ?? { query };
  const lockClause = options.forUpdate ? "FOR UPDATE OF ps" : "";
  const result = await executor.query(
    `SELECT ps.user_id,
            u.username,
            u.first_name,
            u.last_name,
            u.city,
            u.avatar_url,
            ps.bounty,
            ps.wins,
            ps.losses,
            ps.current_win_streak,
            ps.best_win_streak,
            ps.tier
     FROM player_stats ps
     JOIN users u ON u.id = ps.user_id
     WHERE ps.user_id = ANY($1::int[])
     ORDER BY ps.bounty DESC, ps.wins DESC
     ${lockClause}`,
    [userIds]
  );

  return result.rows.map(mapPlayerStatsRow);
}

export async function listPlayerStats(options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ps.user_id,
            u.username,
            u.first_name,
            u.last_name,
            u.city,
            u.avatar_url,
            ps.bounty,
            ps.wins,
            ps.losses,
            ps.current_win_streak,
            ps.best_win_streak,
            ps.tier
     FROM player_stats ps
     JOIN users u ON u.id = ps.user_id
     ORDER BY ps.bounty DESC, ps.wins DESC, u.username ASC`
  );

  return result.rows.map(mapPlayerStatsRow);
}

export async function searchPlayerStatsByUsername(searchTerm, excludeUserId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ps.user_id,
            u.username,
            u.first_name,
            u.last_name,
            u.city,
            u.avatar_url,
            ps.bounty,
            ps.wins,
            ps.losses,
            ps.current_win_streak,
            ps.best_win_streak,
            ps.tier
     FROM player_stats ps
     JOIN users u ON u.id = ps.user_id
     WHERE LOWER(u.username) LIKE LOWER($1)
       AND ps.user_id <> $2
     ORDER BY ps.bounty DESC, ps.wins DESC, u.username ASC
     LIMIT 8`,
    [`%${searchTerm}%`, excludeUserId]
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
     WHERE user_id = $1
     RETURNING user_id,
               bounty,
               wins,
               losses,
               current_win_streak,
               best_win_streak,
               tier`,
    [
      stats.userId,
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
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.username ?? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
    city: row.city,
    avatarUrl: row.avatar_url,
    bounty: Number(row.bounty),
    wins: row.wins,
    losses: row.losses,
    currentWinStreak: row.current_win_streak,
    bestWinStreak: row.best_win_streak,
    tier: row.tier,
    totalGames: row.wins + row.losses
  };
}
