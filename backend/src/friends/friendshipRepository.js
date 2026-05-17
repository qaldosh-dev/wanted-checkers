import { query } from "../db.js";

const FRIEND_SELECT = `f.id,
                       f.requester_user_id,
                       f.addressee_user_id,
                       f.status,
                       f.created_at,
                       f.updated_at`;

const FRIEND_RETURNING = `id,
                          requester_user_id,
                          addressee_user_id,
                          status,
                          created_at,
                          updated_at`;

export async function findFriendshipBetween(leftUserId, rightUserId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ${FRIEND_SELECT}
     FROM friendships f
     WHERE LEAST(f.requester_user_id, f.addressee_user_id) = LEAST($1::int, $2::int)
       AND GREATEST(f.requester_user_id, f.addressee_user_id) = GREATEST($1::int, $2::int)
     LIMIT 1`,
    [leftUserId, rightUserId]
  );

  if (result.rowCount === 0) return null;
  return mapFriendshipRow(result.rows[0]);
}

export async function createFriendshipRequest(requesterUserId, addresseeUserId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `INSERT INTO friendships (requester_user_id, addressee_user_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING ${FRIEND_RETURNING}`,
    [requesterUserId, addresseeUserId]
  );

  return mapFriendshipRow(result.rows[0]);
}

export async function updateFriendshipStatus(friendshipId, status, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `UPDATE friendships
     SET status = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${FRIEND_RETURNING}`,
    [friendshipId, status]
  );

  if (result.rowCount === 0) return null;
  return mapFriendshipRow(result.rows[0]);
}

export async function resetFriendshipRequest(friendshipId, requesterUserId, addresseeUserId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `UPDATE friendships
     SET requester_user_id = $2,
         addressee_user_id = $3,
         status = 'pending',
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${FRIEND_RETURNING}`,
    [friendshipId, requesterUserId, addresseeUserId]
  );

  if (result.rowCount === 0) return null;
  return mapFriendshipRow(result.rows[0]);
}

export async function findFriendshipById(friendshipId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ${FRIEND_SELECT}
     FROM friendships f
     WHERE f.id = $1`,
    [friendshipId]
  );

  if (result.rowCount === 0) return null;
  return mapFriendshipRow(result.rows[0]);
}

export async function listAcceptedFriends(userId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT f.id AS friendship_id,
            ps.user_id,
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
     FROM friendships f
     JOIN player_stats ps
       ON ps.user_id = CASE
         WHEN f.requester_user_id = $1 THEN f.addressee_user_id
         ELSE f.requester_user_id
       END
     JOIN users u ON u.id = ps.user_id
     WHERE f.status = 'accepted'
       AND (f.requester_user_id = $1 OR f.addressee_user_id = $1)
     ORDER BY u.username ASC`,
    [userId]
  );

  return result.rows.map(mapFriendStatsRow);
}

export async function listPendingRequestsForUser(userId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT f.id AS friendship_id,
            ps.user_id,
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
     FROM friendships f
     JOIN player_stats ps ON ps.user_id = f.requester_user_id
     JOIN users u ON u.id = ps.user_id
     WHERE f.status = 'pending'
       AND f.addressee_user_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );

  return result.rows.map(mapFriendStatsRow);
}

export function mapFriendshipRow(row) {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    addresseeUserId: row.addressee_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFriendStatsRow(row) {
  return {
    friendshipId: row.friendship_id,
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
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
