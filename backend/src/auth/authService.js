import { withTransaction } from "../db.js";
import { createPlayerStatsForUser, findPlayerStatsByUserId } from "../playerStatsRepository.js";
import {
  createUser,
  findUserByEmail,
  findUserByIdentifierWithPassword,
  isUsernameOrEmailTaken
} from "../userRepository.js";
import { exchangeGoogleCodeForIdToken, verifyGoogleIdToken } from "./google.js";
import { signAccessToken } from "./jwt.js";
import { hashPassword, verifyPassword } from "./password.js";

export async function registerLocalUser(data) {
  return withTransaction(async (client) => {
    const taken = await isUsernameOrEmailTaken(data, { client });
    if (taken.username || taken.email) {
      return {
        status: 409,
        body: {
          error: "Username or email is already taken.",
          fields: {
            username: taken.username ? "Username is already taken." : undefined,
            email: taken.email ? "Email is already taken." : undefined
          }
        }
      };
    }

    const user = await createUser(
      {
        ...data,
        passwordHash: await hashPassword(data.password),
        provider: "local"
      },
      { client }
    );
    const stats = await createPlayerStatsForUser(user.id, { client });

    return authResponse(user, stats, 201);
  });
}

export async function loginLocalUser({ identifier, password }) {
  const user = await findUserByIdentifierWithPassword(identifier);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { status: 401, body: { error: "Invalid email/username or password." } };
  }

  const stats = await findPlayerStatsByUserId(user.id);
  return authResponse(user, stats);
}

export async function loginGoogleUser({ idToken, city }) {
  const googleProfile = await verifyGoogleIdToken(idToken);

  return withTransaction(async (client) => {
    let user = await findUserByEmail(googleProfile.email, { client });

    if (!user) {
      user = await createUser(
        {
          firstName: googleProfile.firstName || "Wanted",
          lastName: googleProfile.lastName || "Player",
          username: await buildUniqueGoogleUsername(googleProfile.email, client),
          email: googleProfile.email,
          passwordHash: null,
          city: city ?? "",
          avatarUrl: googleProfile.avatarUrl,
          provider: "google"
        },
        { client }
      );
    }

    const stats = await createPlayerStatsForUser(user.id, { client });
    return authResponse(user, stats);
  });
}

export async function loginGoogleUserWithCode({ code, city }) {
  const idToken = await exchangeGoogleCodeForIdToken(code);
  return loginGoogleUser({ idToken, city });
}

function authResponse(user, stats, status = 200) {
  return {
    status,
    body: {
      token: signAccessToken(user),
      user,
      stats
    }
  };
}

async function buildUniqueGoogleUsername(email, client) {
  const normalized = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 20);
  const base = normalized.length >= 3 ? normalized : "google_player";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const username = attempt === 0 ? base : `${base}_${attempt}`;
    const taken = await isUsernameOrEmailTaken({ username, email: `${username}@placeholder.local` }, { client });
    if (!taken.username) return username;
  }

  return `${base}_${Date.now().toString(36)}`.slice(0, 24);
}
