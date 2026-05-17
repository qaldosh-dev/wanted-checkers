import { findPlayerStatsByUserId } from "../playerStatsRepository.js";
import { emitToUser, isUserOnline } from "../socket/presenceService.js";
import { findUserById } from "../userRepository.js";
import {
  createFriendshipRequest,
  findFriendshipBetween,
  findFriendshipById,
  listAcceptedFriends,
  listPendingRequestsForUser,
  resetFriendshipRequest,
  updateFriendshipStatus
} from "./friendshipRepository.js";

export async function requestFriendship(currentUser, addresseeUserId) {
  const targetUserId = Number(addresseeUserId);
  if (!Number.isInteger(targetUserId)) {
    return badRequest("Valid addresseeUserId is required.");
  }
  if (targetUserId === currentUser.id) {
    return badRequest("You cannot add yourself as a friend.");
  }

  const targetUser = await findUserById(targetUserId);
  if (!targetUser) return notFound("Player not found.");

  const existing = await findFriendshipBetween(currentUser.id, targetUserId);
  if (existing?.status === "pending") return conflict("A friend request is already pending.");
  if (existing?.status === "accepted") return conflict("You are already friends.");

  const friendship = existing
    ? await resetFriendshipRequest(existing.id, currentUser.id, targetUserId)
    : await createFriendshipRequest(currentUser.id, targetUserId);
  const requesterStats = await findPlayerStatsByUserId(currentUser.id);
  const payload = {
    friendship,
    requester: decoratePresence(requesterStats)
  };

  emitToUser(targetUserId, "friend:request_received", payload);
  return { status: existing ? 200 : 201, body: payload };
}

export async function acceptFriendship(currentUser, friendshipId) {
  const friendship = await findFriendshipById(Number(friendshipId));
  if (!friendship) return notFound("Friend request not found.");
  if (friendship.addresseeUserId !== currentUser.id) return forbidden("This friend request is not for you.");
  if (friendship.status === "accepted") return conflict("Friend request is already accepted.");
  if (friendship.status !== "pending") return conflict("Friend request is no longer pending.");

  const updated = await updateFriendshipStatus(friendship.id, "accepted");
  const addresseeStats = await findPlayerStatsByUserId(currentUser.id);
  const payload = {
    friendship: updated,
    friend: decoratePresence(addresseeStats)
  };

  emitToUser(friendship.requesterUserId, "friend:request_accepted", payload);
  return { status: 200, body: payload };
}

export async function declineFriendship(currentUser, friendshipId) {
  const friendship = await findFriendshipById(Number(friendshipId));
  if (!friendship) return notFound("Friend request not found.");
  if (friendship.addresseeUserId !== currentUser.id) return forbidden("This friend request is not for you.");
  if (friendship.status !== "pending") return conflict("Friend request is no longer pending.");

  const updated = await updateFriendshipStatus(friendship.id, "declined");
  const addresseeStats = await findPlayerStatsByUserId(currentUser.id);
  const payload = {
    friendship: updated,
    friend: decoratePresence(addresseeStats)
  };

  emitToUser(friendship.requesterUserId, "friend:request_declined", payload);
  return { status: 200, body: payload };
}

export async function listFriends(userId) {
  const friends = await listAcceptedFriends(userId);
  return {
    status: 200,
    body: { friends: friends.map(decoratePresence) }
  };
}

export async function listFriendRequests(userId) {
  const requests = await listPendingRequestsForUser(userId);
  return {
    status: 200,
    body: { requests: requests.map(decoratePresence) }
  };
}

function decoratePresence(player) {
  if (!player) return null;
  return {
    ...player,
    isOnline: isUserOnline(player.userId)
  };
}

function badRequest(message) {
  return { status: 400, body: { error: message } };
}

function notFound(message) {
  return { status: 404, body: { error: message } };
}

function forbidden(message) {
  return { status: 403, body: { error: message } };
}

function conflict(message) {
  return { status: 409, body: { error: message } };
}
