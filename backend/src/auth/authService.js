import { withTransaction } from "../db.js";
import { createPlayerStatsForUser, findPlayerStatsByUserId } from "../playerStatsRepository.js";
import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  isUsernameTaken,
  updateUserGoogleIdentity
} from "../userRepository.js";
import { buildDefaultAvatarUrl } from "../uploads/avatarUpload.js";
import { verifyGoogleIdToken } from "./google.js";
import { signAccessToken, signGoogleOnboardingToken, verifyGoogleOnboardingToken } from "./jwt.js";

export async function loginGoogleUser({ credential }) {
  const googleProfile = await verifyGoogleIdToken(credential);

  return withTransaction(async (client) => {
    let user = await findUserByGoogleId(googleProfile.googleSubject, { client });
    if (!user) user = await findUserByEmail(googleProfile.email, { client });

    if (user) {
      user = await updateUserGoogleIdentity(user.id, googleProfile, { client });
      const stats = await createPlayerStatsForUser(user.id, { client });
      return authResponse(user, stats);
    }

    return {
      status: 202,
      body: {
        onboardingRequired: true,
        onboardingToken: signGoogleOnboardingToken(googleProfile),
        profile: publicGoogleProfile(googleProfile),
        suggestedUsername: await buildSuggestedUsername(googleProfile, client)
      }
    };
  });
}

export async function completeGoogleOnboarding({ onboardingToken, username, city, avatarUrl }) {
  const googleProfile = verifyGoogleOnboardingToken(onboardingToken);

  return withTransaction(async (client) => {
    let user = await findUserByGoogleId(googleProfile.googleSubject, { client });
    if (!user) user = await findUserByEmail(googleProfile.email, { client });

    if (user) {
      user = await updateUserGoogleIdentity(user.id, googleProfile, { client });
      const stats = await createPlayerStatsForUser(user.id, { client });
      return authResponse(user, stats);
    }

    if (await isUsernameTaken(username, { client })) {
      return {
        status: 409,
        body: {
          error: "Username is already taken.",
          fields: { username: "Username is already taken." }
        }
      };
    }

    user = await createUser(
      {
        googleId: googleProfile.googleSubject,
        firstName: googleProfile.firstName || "Wanted",
        lastName: googleProfile.lastName || "Player",
        username,
        email: googleProfile.email,
        city,
        avatarUrl: avatarUrl || googleProfile.avatarUrl || buildDefaultAvatarUrl(username),
        provider: "google"
      },
      { client }
    );
    const stats = await createPlayerStatsForUser(user.id, { client });
    return authResponse(user, stats, 201);
  });
}

export async function getUsernameAvailability(username) {
  return {
    username,
    available: !(await isUsernameTaken(username))
  };
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

async function buildSuggestedUsername(profile, client) {
  const source = `${profile.firstName}_${profile.lastName}`.trim() || profile.email.split("@")[0];
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  const base = normalized.length >= 3 ? normalized : "wanted_player";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const username = attempt === 0 ? base : `${base}_${attempt}`;
    if (!(await isUsernameTaken(username, { client }))) return username;
  }

  return `${base}_${Date.now().toString(36)}`.slice(0, 24);
}

function publicGoogleProfile(profile) {
  return {
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    avatarUrl: profile.avatarUrl
  };
}
