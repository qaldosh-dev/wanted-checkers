import {
  applyMove,
  createInitialState,
  getLegalMoves,
  serializeMove
} from "../engine/checkers.js";
import {
  createGameRecord,
  findActiveOnlineGameForUser,
  findGameRecord,
  updateGameRecord
} from "../gameRepository.js";
import { findUserById } from "../userRepository.js";
import { completeMatchWithBounty } from "../matchResultService.js";
import { appendReplayEvent, appendReplayMove } from "../replay/moveHistory.js";
import { createInitialBlitzState, advanceBlitzAfterMove } from "../blitz/blitzClock.js";
import {
  broadcastBlitzTimer,
  enforceBlitzTimeout,
  isBlitzMode,
  startBlitzTimer,
  stopBlitzTimer
} from "../blitz/timerService.js";

const drawOffers = new Map();

export async function getActiveOnlineMatchStateForUser(userId) {
  const game = await findActiveOnlineGameForUser(userId);
  if (!isConfirmedActiveOnlineGame(game)) return { active: false, game: null };

  const [playerOne, playerTwo] = await Promise.all([
    findUserById(game.playerOneUserId),
    findUserById(game.playerTwoUserId)
  ]);

  if (!playerOne || !playerTwo) return { active: false, game: null };

  return {
    active: true,
    game,
    players: {
      playerOne: publicUser(playerOne),
      playerTwo: publicUser(playerTwo)
    }
  };
}

export async function emitActiveOnlineMatchState(socket) {
  const state = await getActiveOnlineMatchStateForUser(socket.data.user.id);
  socket.emit("active_match:state", state);
  return state;
}

export async function createMultiplayerGame(io, match) {
  const mode = normalizeLiveMode(match.mode);
  await assertUserCanStartOnlineGame(match.playerOne.user.id);
  await assertUserCanStartOnlineGame(match.playerTwo.user.id);
  const game = await createGameRecord(createInitialState(), {
    playerOneUserId: match.playerOne.user.id,
    playerTwoUserId: match.playerTwo.user.id,
    mode,
    blitzState: mode === "blitz" ? createInitialBlitzState() : null
  });

  joinSocketToGame(match.playerOne.socket, game.gameId);
  joinSocketToGame(match.playerTwo.socket, game.gameId);

  const room = gameRoomName(game.gameId);
  io.to(room).emit("queue:matched", {
    game,
    mode,
    players: {
      playerOne: publicUser(match.playerOne.user),
      playerTwo: publicUser(match.playerTwo.user)
    }
  });
  if (isBlitzMode(mode)) {
    io.to(room).emit("blitz:started", { game, blitzState: game.blitzState });
    startBlitzTimer(io, game.gameId);
    broadcastBlitzTimer(io, game);
  }

  return game;
}

export async function joinExistingGame(io, socket, gameId) {
  const game = await findGameRecord(gameId);
  if (!game) throw new Error("Game not found.");
  if (!isLiveMultiplayerMode(game.mode)) throw new Error("This is not a multiplayer game.");
  if (!isParticipant(game, socket.data.user.id)) throw new Error("You are not a participant in this game.");

  joinSocketToGame(socket, game.gameId);
  socket.emit("game:update", { game });
  broadcastBlitzTimer(io, game);
  if (isBlitzMode(game.mode) && game.status === "ongoing") startBlitzTimer(io, game.gameId);
  return game;
}

export async function handleMultiplayerMove(io, socket, payload) {
  let game = await findGameRecord(payload?.gameId);
  if (!game) throw new Error("Game not found.");
  if (!isLiveMultiplayerMode(game.mode)) throw new Error("This game is not a live multiplayer match.");
  if (game.status !== "ongoing") throw new Error("Game is already finished.");
  game = await enforceBlitzTimeout(io, game);
  if (game.status !== "ongoing") return game;

  const playerNumber = playerNumberForUser(game, socket.data.user.id);
  if (!playerNumber) throw new Error("You are not a participant in this game.");
  if (game.currentTurn !== playerNumber) throw new Error("It is not your turn.");

  const engineState = toEngineState(game);
  const legalMove = getLegalMoves(engineState).find(
    (move) => move.from === Number(payload.from) && move.to === Number(payload.to)
  );
  if (!legalMove) throw new Error("Illegal move.");

  const nextState = applyMove(engineState, legalMove);
  const moveHistory = appendReplayMove(game.moveHistory, engineState, legalMove, nextState, playerNumber);
  const blitzState = isBlitzMode(game.mode) && nextState.status === "ongoing"
    ? advanceBlitzAfterMove(game.blitzState, nextState.currentTurn)
    : game.blitzState;
  const updated =
    nextState.status !== "ongoing"
      ? await completeMatchWithBounty(game, { ...nextState, moveHistory, blitzState: blitzState ? { ...blitzState, finished: true } : blitzState })
      : await updateGameRecord(game.gameId, { ...nextState, moveHistory, blitzState });

  broadcastGame(io, updated);
  broadcastBlitzTimer(io, updated);
  if (updated.status !== "ongoing") stopBlitzTimer(updated.gameId);
  return updated;
}

export async function handleDrawOffer(io, socket, payload) {
  const game = await findGameRecord(payload?.gameId);
  if (!game) throw new Error("Game not found.");
  if (!isLiveMultiplayerMode(game.mode)) throw new Error("This game is not a live multiplayer match.");
  if (game.status !== "ongoing") throw new Error("Game is already finished.");

  const playerNumber = playerNumberForUser(game, socket.data.user.id);
  if (!playerNumber) throw new Error("You are not a participant in this game.");

  const existingOffer = drawOffers.get(game.gameId);
  if (existingOffer?.offeredBy === playerNumber) throw new Error("You already offered a draw.");
  if (existingOffer && existingOffer.offeredBy !== playerNumber) {
    return completeDrawAgreement(io, game, playerNumber);
  }

  const offer = {
    gameId: game.gameId,
    offeredBy: playerNumber,
    offeredByUserId: socket.data.user.id,
    offeredAt: Date.now()
  };
  drawOffers.set(game.gameId, offer);
  io.to(gameRoomName(game.gameId)).emit("draw:offered", {
    gameId: game.gameId,
    offeredBy: playerNumber,
    offeredByUsername: socket.data.user.username
  });
  return game;
}

export async function handleDrawResponse(io, socket, payload) {
  const game = await findGameRecord(payload?.gameId);
  if (!game) throw new Error("Game not found.");
  if (!isLiveMultiplayerMode(game.mode)) throw new Error("This game is not a live multiplayer match.");
  if (game.status !== "ongoing") throw new Error("Game is already finished.");

  const playerNumber = playerNumberForUser(game, socket.data.user.id);
  if (!playerNumber) throw new Error("You are not a participant in this game.");

  const offer = drawOffers.get(game.gameId);
  if (!offer) throw new Error("There is no active draw offer.");
  if (offer.offeredBy === playerNumber) throw new Error("You cannot accept your own draw offer.");

  if (!payload?.accepted) {
    drawOffers.delete(game.gameId);
    io.to(gameRoomName(game.gameId)).emit("draw:declined", {
      gameId: game.gameId,
      declinedBy: playerNumber,
      declinedByUsername: socket.data.user.username
    });
    return game;
  }

  return completeDrawAgreement(io, game, playerNumber);
}

export async function handleResign(io, socket, payload) {
  const game = await findGameRecord(payload?.gameId);
  if (!game) throw new Error("Game not found.");
  if (!isLiveMultiplayerMode(game.mode)) throw new Error("This game is not a live multiplayer match.");
  if (game.status !== "ongoing") throw new Error("Game is already finished.");

  const playerNumber = playerNumberForUser(game, socket.data.user.id);
  if (!playerNumber) throw new Error("You are not a participant in this game.");

  const winner = playerNumber === 1 ? 2 : 1;
  const nextState = {
    ...toEngineState(game),
    status: "finished",
    winner,
    forcedFrom: null,
    blitzState: game.blitzState ? { ...game.blitzState, finished: true } : null,
    moveHistory: appendReplayEvent(game.moveHistory, { ...toEngineState(game), status: "finished", winner }, {
      player: playerNumber,
      type: "resign",
      at: new Date().toISOString()
    })
  };
  const updated = await completeMatchWithBounty(game, nextState);
  drawOffers.delete(game.gameId);
  broadcastGame(io, updated);
  stopBlitzTimer(updated.gameId);
  return updated;
}

export function notifyDisconnect(io, socket) {
  for (const gameId of socket.data.gameIds ?? []) {
    socket.to(gameRoomName(gameId)).emit("game:error", {
      message: "Opponent disconnected. They can rejoin by returning to the match."
    });
  }
}

function broadcastGame(io, game) {
  const event = game.status === "ongoing" ? "game:update" : "game:finished";
  io.to(gameRoomName(game.gameId)).emit(event, { game });
  if (event !== "game:update") io.to(gameRoomName(game.gameId)).emit("game:update", { game });
}

async function completeDrawAgreement(io, game, acceptedBy) {
  const nextState = {
    ...toEngineState(game),
    status: "draw",
    winner: null,
    forcedFrom: null,
    drawReason: "agreement",
    blitzState: game.blitzState ? { ...game.blitzState, finished: true } : null,
    moveHistory: appendReplayEvent(game.moveHistory, { ...toEngineState(game), status: "draw", winner: null }, {
      player: acceptedBy,
      type: "draw_agreement",
      at: new Date().toISOString()
    })
  };
  const updated = await completeMatchWithBounty(game, nextState);
  drawOffers.delete(game.gameId);
  io.to(gameRoomName(game.gameId)).emit("draw:accepted", { gameId: game.gameId, game: updated });
  broadcastGame(io, updated);
  stopBlitzTimer(updated.gameId);
  return updated;
}

export async function assertUserCanStartOnlineGame(userId) {
  const activeState = await getActiveOnlineMatchStateForUser(userId);
  if (activeState.active) {
    throw new Error("You are currently in an active online game. Resign or finish it before starting another match.");
  }
}

function isLiveMultiplayerMode(mode) {
  return mode === "multiplayer" || mode === "blitz" || mode === "blind_hunt";
}

function isConfirmedActiveOnlineGame(game) {
  return Boolean(
    game &&
    game.status === "ongoing" &&
    isLiveMultiplayerMode(game.mode) &&
    game.playerOneUserId &&
    game.playerTwoUserId
  );
}

function normalizeLiveMode(mode) {
  if (mode === "blitz") return "blitz";
  if (mode === "blind_hunt") return "blind_hunt";
  return "multiplayer";
}

function joinSocketToGame(socket, gameId) {
  socket.join(gameRoomName(gameId));
  socket.data.gameIds = new Set([...(socket.data.gameIds ?? []), gameId]);
}

function gameRoomName(gameId) {
  return `game:${gameId}`;
}

function toEngineState(game) {
  return {
    board: game.board,
    currentTurn: game.currentTurn,
    forcedFrom: game.forcedFrom,
    positionCounts: game.positionCounts,
    movesWithoutProgress: game.movesWithoutProgress,
    status: game.status,
    winner: game.winner
  };
}

function playerNumberForUser(game, userId) {
  if (game.playerOneUserId === userId) return 1;
  if (game.playerTwoUserId === userId) return 2;
  return null;
}

function isParticipant(game, userId) {
  return playerNumberForUser(game, userId) !== null;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl
  };
}
