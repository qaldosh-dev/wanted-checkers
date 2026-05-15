import { query } from "./db.js";

export async function createUser(user, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `INSERT INTO users (
       first_name,
       last_name,
       username,
       email,
       password_hash,
       city,
       avatar_url,
       provider
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id,
               first_name,
               last_name,
               username,
               email,
               city,
               avatar_url,
               provider,
               created_at,
               updated_at`,
    [
      user.firstName,
      user.lastName,
      user.username,
      user.email.toLowerCase(),
      user.passwordHash ?? null,
      user.city || null,
      user.avatarUrl || null,
      user.provider
    ]
  );

  return mapUserRow(result.rows[0]);
}

export async function findUserById(id, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT id,
            first_name,
            last_name,
            username,
            email,
            city,
            avatar_url,
            provider,
            created_at,
            updated_at
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
    `SELECT id,
            first_name,
            last_name,
            username,
            email,
            city,
            avatar_url,
            provider,
            created_at,
            updated_at
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  if (result.rowCount === 0) return null;
  return mapUserRow(result.rows[0]);
}

export async function findUserByIdentifierWithPassword(identifier, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT id,
            first_name,
            last_name,
            username,
            email,
            password_hash,
            city,
            avatar_url,
            provider,
            created_at,
            updated_at
     FROM users
     WHERE LOWER(email) = LOWER($1)
        OR LOWER(username) = LOWER($1)`,
    [identifier]
  );

  if (result.rowCount === 0) return null;
  return mapUserRow(result.rows[0], { includePasswordHash: true });
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
     RETURNING id,
               first_name,
               last_name,
               username,
               email,
               city,
               avatar_url,
               provider,
               created_at,
               updated_at`,
    [userId, profile.firstName, profile.lastName, profile.city || null, profile.avatarUrl || null]
  );

  return mapUserRow(result.rows[0]);
}

export async function isUsernameOrEmailTaken({ username, email }, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT username, email
     FROM users
     WHERE LOWER(username) = LOWER($1)
        OR LOWER(email) = LOWER($2)`,
    [username, email]
  );

  return result.rows.reduce(
    (taken, row) => ({
      username: taken.username || row.username.toLowerCase() === username.toLowerCase(),
      email: taken.email || row.email.toLowerCase() === email.toLowerCase()
    }),
    { username: false, email: false }
  );
}

export function mapUserRow(row, options = {}) {
  const user = {
    id: row.id,
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

  if (options.includePasswordHash) user.passwordHash = row.password_hash;
  return user;
}
