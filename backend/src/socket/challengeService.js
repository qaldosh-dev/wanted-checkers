import { randomUUID } from "node:crypto";
import { findUserByUsername } from "../userRepository.js";
import { findActiveOnlineGameForUser } from "../gameRepository.js";
import {
  emitToUser,
  getPrimarySocket,
  isUserOnline
} from "./presenceService.js";

const CHALLENGE_TTL_MS = 60_000;
const challenges = new Map();
const challengeKeys = new Map();

export async function sendChallenge(socket, payload) {
  const targetUsername = String(payload?.username ?? "").trim();
  if (!targetUsername) throw new Error("Target username is required.");
  const mode = normalizeChallengeMode(payload?.mode);

  const targetUser = await findUserByUsername(targetUsername);
  if (!targetUser) throw new Error("Player not found.");
  if (targetUser.id === socket.data.user.id) throw new Error("You cannot challenge yourself.");
  if (!isUserOnline(targetUser.id)) throw new Error("That player is not online right now.");
  if (await findActiveOnlineGameForUser(socket.data.user.id)) {
    throw new Error("You are currently in an active online game. Resign or finish it before challenging another player.");
  }
  if (await findActiveOnlineGameForUser(targetUser.id)) {
    throw new Error("That player is already in an active online game.");
  }

  const key = challengePairKey(socket.data.user.id, targetUser.id);
  if (challengeKeys.has(key)) throw new Error("A challenge is already active between these players.");

  const challenge = {
    id: randomUUID(),
    challengerUser: publicUser(socket.data.user),
    targetUser: publicUser(targetUser),
    mode,
    createdAt: Date.now(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS
  };
  challenge.timeout = setTimeout(() => expireChallenge(challenge.id), CHALLENGE_TTL_MS);

  challenges.set(challenge.id, challenge);
  challengeKeys.set(key, challenge.id);

  emitToUser(targetUser.id, "challenge:received", { challenge: publicChallenge(challenge) });
  socket.emit("challenge:sent", { challenge: publicChallenge(challenge) });
  return challenge;
}

function normalizeChallengeMode(mode) {
  if (mode === "blitz") return "blitz";
  if (mode === "blind_hunt") return "blind_hunt";
  return "multiplayer";
}

export function acceptChallenge(socket, payload) {
  const challenge = getChallengeForTarget(socket, payload?.challengeId);
  removeChallenge(challenge.id);

  const challengerSocket = getPrimarySocket(challenge.challengerUser.id);
  if (!challengerSocket) throw new Error("Challenger is no longer online.");

  return {
    playerOne: {
      socket: challengerSocket,
      user: challenge.challengerUser
    },
    playerTwo: {
      socket,
      user: socket.data.user
    },
    mode: challenge.mode,
    challenge: publicChallenge(challenge)
  };
}

export function declineChallenge(socket, payload) {
  const challenge = getChallengeForTarget(socket, payload?.challengeId);
  removeChallenge(challenge.id);
  emitToUser(challenge.challengerUser.id, "challenge:declined", {
    challenge: publicChallenge(challenge),
    reason: "declined"
  });
  socket.emit("challenge:declined", {
    challenge: publicChallenge(challenge),
    reason: "declined"
  });
}

function getChallengeForTarget(socket, challengeId) {
  const challenge = challenges.get(challengeId);
  if (!challenge) throw new Error("Challenge has expired or no longer exists.");
  if (challenge.targetUser.id !== socket.data.user.id) throw new Error("This challenge is not for you.");
  return challenge;
}

function expireChallenge(challengeId) {
  const challenge = challenges.get(challengeId);
  if (!challenge) return;
  removeChallenge(challengeId);
  emitToUser(challenge.challengerUser.id, "challenge:declined", {
    challenge: publicChallenge(challenge),
    reason: "expired"
  });
  emitToUser(challenge.targetUser.id, "challenge:declined", {
    challenge: publicChallenge(challenge),
    reason: "expired"
  });
}

function removeChallenge(challengeId) {
  const challenge = challenges.get(challengeId);
  if (!challenge) return;
  clearTimeout(challenge.timeout);
  challenges.delete(challengeId);
  challengeKeys.delete(challengePairKey(challenge.challengerUser.id, challenge.targetUser.id));
}

function challengePairKey(leftUserId, rightUserId) {
  return [leftUserId, rightUserId].sort((left, right) => Number(left) - Number(right)).join(":");
}

function publicChallenge(challenge) {
  return {
    id: challenge.id,
    challenger: challenge.challengerUser,
    target: challenge.targetUser,
    mode: challenge.mode,
    expiresAt: challenge.expiresAt
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl
  };
}
