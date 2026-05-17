import { query } from "./db.js";

const USER_COLUMNS = `id,
                      google_id,
                      first_name,
                      last_name,
                      username,
                      email,
                      city,
                      avatar_url,
                      provider,
                      created_at,
                      updated_at`;

export async function createUser(user, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `INSERT INTO users (
       google_id,
       first_name,
       last_name,
       username,
       email,
       city,
       avatar_url,
       provider
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'google')
     RETURNING ${USER_COLUMNS}`,
    [
      user.googleId,
      user.firstName,
      user.lastName,
      user.username,
      user.email.toLowerCase(),
      user.city || null,
      user.avatarUrl || null
    ]
  );

  return mapUserRow(result.rows[0]);
}

export async function findUserById(id, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) return null;
  return mapUserRow(result.rows[0]);
}

export async function findUserByEmail(email, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  if (result.rowCount === 0) return null;
  return mapUserRow(result.rows[0]);
}

export async function findUserByGoogleId(googleId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE google_id = $1`,
    [googleId]
  );

  if (result.rowCount === 0) return null;
  return mapUserRow(result.rows[0]);
}

export async function findUserByUsername(username, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE LOWER(username) = LOWER($1)`,
    [username]
  );

  if (result.rowCount === 0) return null;
  return mapUserRow(result.rows[0]);
}

export async function updateUserProfile(userId, profile, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `UPDATE users
     SET first_name = $2,
         last_name = $3,
         city = $4,
         avatar_url = $5,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, profile.firstName, profile.lastName, profile.city || null, profile.avatarUrl || null]
  );

  return mapUserRow(result.rows[0]);
}

export async function updateUserGoogleIdentity(userId, profile, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `UPDATE users
     SET google_id = COALESCE(google_id, $2),
         email = LOWER($3),
         first_name = COALESCE(NULLIF(first_name, ''), $4),
         last_name = COALESCE(NULLIF(last_name, ''), $5),
         avatar_url = COALESCE(NULLIF(avatar_url, ''), $6),
         provider = 'google',
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [
      userId,
      profile.googleSubject,
      profile.email,
      profile.firstName || "Wanted",
      profile.lastName || "Player",
      profile.avatarUrl || null
    ]
  );

  return mapUserRow(result.rows[0]);
}

export async function isUsernameTaken(username, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT 1
     FROM users
     WHERE LOWER(username) = LOWER($1)
     LIMIT 1`,
    [username]
  );

  return result.rowCount > 0;
}

export function mapUserRow(row) {
  return {
    id: row.id,
    googleId: row.google_id,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    email: row.email,
    city: row.city,
    avatarUrl: row.avatar_url,
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
