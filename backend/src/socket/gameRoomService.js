import {
  applyMove,
  createInitialState,
  getLegalMoves,
  serializeMove
} from "../engine/checkers.js";
import {
  createGameRecord,
  findGameRecord,
  updateGameRecord
} from "../gameRepository.js";
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

export async function createMultiplayerGame(io, match) {
  const mode = normalizeLiveMode(match.mode);
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

function isLiveMultiplayerMode(mode) {
  return mode === "multiplayer" || mode === "blitz" || mode === "blind_hunt";
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
