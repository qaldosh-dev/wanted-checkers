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

export async function createMultiplayerGame(io, match) {
  const game = await createGameRecord(createInitialState(), {
    playerOneUserId: match.playerOne.user.id,
    playerTwoUserId: match.playerTwo.user.id,
    mode: "multiplayer"
  });

  joinSocketToGame(match.playerOne.socket, game.gameId);
  joinSocketToGame(match.playerTwo.socket, game.gameId);

  const room = gameRoomName(game.gameId);
  io.to(room).emit("queue:matched", {
    game,
    players: {
      playerOne: publicUser(match.playerOne.user),
      playerTwo: publicUser(match.playerTwo.user)
    }
  });

  return game;
}

export async function joinExistingGame(socket, gameId) {
  const game = await findGameRecord(gameId);
  if (!game) throw new Error("Game not found.");
  if (game.mode !== "multiplayer") throw new Error("This is not a multiplayer game.");
  if (!isParticipant(game, socket.data.user.id)) throw new Error("You are not a participant in this game.");

  joinSocketToGame(socket, game.gameId);
  socket.emit("game:update", { game });
  return game;
}

export async function handleMultiplayerMove(io, socket, payload) {
  const game = await findGameRecord(payload?.gameId);
  if (!game) throw new Error("Game not found.");
  if (game.mode !== "multiplayer") throw new Error("This game is not a live multiplayer match.");
  if (game.status !== "ongoing") throw new Error("Game is already finished.");

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
  const updated =
    nextState.status !== "ongoing"
      ? await completeMatchWithBounty(game, { ...nextState, moveHistory })
      : await updateGameRecord(game.gameId, { ...nextState, moveHistory });

  broadcastGame(io, updated);
  return updated;
}

export async function handleResign(io, socket, payload) {
  const game = await findGameRecord(payload?.gameId);
  if (!game) throw new Error("Game not found.");
  if (game.mode !== "multiplayer") throw new Error("This game is not a live multiplayer match.");
  if (game.status !== "ongoing") throw new Error("Game is already finished.");

  const playerNumber = playerNumberForUser(game, socket.data.user.id);
  if (!playerNumber) throw new Error("You are not a participant in this game.");

  const winner = playerNumber === 1 ? 2 : 1;
  const nextState = {
    ...toEngineState(game),
    status: "finished",
    winner,
    forcedFrom: null,
    moveHistory: appendReplayEvent(game.moveHistory, { ...toEngineState(game), status: "finished", winner }, {
      player: playerNumber,
      type: "resign",
      at: new Date().toISOString()
    })
  };
  const updated = await completeMatchWithBounty(game, nextState);
  broadcastGame(io, updated);
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
