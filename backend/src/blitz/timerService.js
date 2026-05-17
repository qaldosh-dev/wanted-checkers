import { findGameRecord } from "../gameRepository.js";
import { completeMatchWithBounty } from "../matchResultService.js";
import { appendReplayEvent } from "../replay/moveHistory.js";
import { materializeBlitzState, publicBlitzState } from "./blitzClock.js";

const intervals = new Map();
const TICK_MS = 1000;

export function isBlitzMode(mode) {
  return mode === "blitz";
}

export function startBlitzTimer(io, gameId) {
  stopBlitzTimer(gameId);
  const intervalId = setInterval(() => {
    tickBlitzGame(io, gameId).catch((error) => {
      io.to(gameRoomName(gameId)).emit("game:error", { message: error.message });
    });
  }, TICK_MS);
  intervals.set(gameId, intervalId);
}

export function stopBlitzTimer(gameId) {
  const intervalId = intervals.get(gameId);
  if (!intervalId) return;
  clearInterval(intervalId);
  intervals.delete(gameId);
}

export function broadcastBlitzTimer(io, game) {
  if (!isBlitzMode(game.mode) || !game.blitzState) return;
  io.to(gameRoomName(game.gameId)).emit("timer:update", {
    gameId: game.gameId,
    blitzState: publicBlitzState(game.blitzState)
  });
}

export async function enforceBlitzTimeout(io, game) {
  if (!isBlitzMode(game.mode) || !game.blitzState || game.status !== "ongoing") return game;
  const materialized = materializeBlitzState(game.blitzState);
  if (!materialized?.timedOut) {
    return { ...game, blitzState: materialized };
  }

  return finishBlitzTimeout(io, { ...game, blitzState: materialized }, materialized.loser);
}

export async function tickBlitzGame(io, gameId) {
  const game = await findGameRecord(gameId);
  if (!game || game.status !== "ongoing" || !isBlitzMode(game.mode)) {
    stopBlitzTimer(gameId);
    return null;
  }

  const checked = await enforceBlitzTimeout(io, game);
  if (checked.status !== "ongoing") return checked;

  broadcastBlitzTimer(io, checked);
  return checked;
}

async function finishBlitzTimeout(io, game, loser) {
  const winner = loser === 1 ? 2 : 1;
  const nextState = {
    board: game.board,
    currentTurn: game.currentTurn,
    forcedFrom: null,
    positionCounts: game.positionCounts,
    movesWithoutProgress: game.movesWithoutProgress,
    status: "finished",
    winner,
    blitzState: {
      ...game.blitzState,
      finished: true,
      timeoutLoser: loser,
      timeoutWinner: winner,
      timeoutAt: new Date().toISOString()
    },
    moveHistory: appendReplayEvent(game.moveHistory, {
      board: game.board,
      currentTurn: game.currentTurn,
      forcedFrom: null,
      status: "finished",
      winner
    }, {
      player: loser,
      type: "timeout",
      at: new Date().toISOString()
    })
  };

  const updated = await completeMatchWithBounty(game, nextState);
  stopBlitzTimer(game.gameId);
  io.to(gameRoomName(game.gameId)).emit("timer:timeout", {
    gameId: game.gameId,
    loser,
    winner,
    blitzState: publicBlitzState(updated.blitzState)
  });
  io.to(gameRoomName(game.gameId)).emit("game:finished", { game: updated });
  io.to(gameRoomName(game.gameId)).emit("game:update", { game: updated });
  return updated;
}

function gameRoomName(gameId) {
  return `game:${gameId}`;
}
