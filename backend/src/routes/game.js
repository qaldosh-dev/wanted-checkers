import { randomUUID } from "node:crypto";
import express from "express";
import { requireAuth } from "../auth/middleware.js";
import { applyAiTurn } from "../ai/aiEngine.js";
import {
  applyMove,
  createInitialState,
  getLegalMovesFrom,
  serializeMove
} from "../engine/checkers.js";
import {
  createGameRecord,
  findGameRecord,
  updateGameRecord
} from "../gameRepository.js";
import { completeMatchWithBounty } from "../matchResultService.js";
import { findPlayerStatsByUserIds } from "../playerStatsRepository.js";

export const gameRouter = express.Router();

gameRouter.post("/start", requireAuth, async (req, res, next) => {
  try {
    const mode = normalizeGameMode(req.body?.mode);
    const aiDifficulty = mode === "vs_ai" ? normalizeAiDifficulty(req.body?.aiDifficulty) : null;
    const opponentUserId = await resolveOpponentUserId(req.user.id, req.body?.opponentUserId);

    const game = await createGameRecord(createInitialState(), {
      playerOneUserId: req.user.id,
      playerTwoUserId: mode === "vs_ai" ? null : opponentUserId ?? null,
      mode,
      aiDifficulty
    });

    res.status(201).json({
      sessionId: req.body?.sessionId ?? randomUUID(),
      ...game
    });
  } catch (error) {
    next(error);
  }
});

gameRouter.get("/state/:gameId", async (req, res, next) => {
  try {
    const game = await findGameRecord(req.params.gameId);
    if (!game) {
      res.status(404).json({ error: "Game not found." });
      return;
    }

    res.json(game);
  } catch (error) {
    next(error);
  }
});

gameRouter.get("/moves/:gameId/:from", requireAuth, async (req, res, next) => {
  try {
    const game = await findGameRecord(req.params.gameId);
    if (!game) {
      res.status(404).json({ error: "Game not found." });
      return;
    }
    if (!isParticipant(game, req.user.id)) {
      res.status(403).json({ error: "You are not a participant in this game." });
      return;
    }
    if (game.mode === "vs_ai" && game.currentTurn !== 1) {
      res.json({ gameId: game.gameId, from: Number(req.params.from), moves: [] });
      return;
    }

    const moves = getLegalMovesFrom(toEngineState(game), Number(req.params.from)).map(serializeMove);
    res.json({ gameId: game.gameId, from: Number(req.params.from), moves });
  } catch (error) {
    if (/Invalid board index/.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

gameRouter.post("/move", requireAuth, async (req, res, next) => {
  try {
    const { gameId, from, to } = req.body ?? {};
    if (!gameId || from === undefined || to === undefined) {
      res.status(400).json({ error: "gameId, from, and to are required." });
      return;
    }

    const game = await findGameRecord(gameId);
    if (!game) {
      res.status(404).json({ error: "Game not found." });
      return;
    }
    if (!isParticipant(game, req.user.id)) {
      res.status(403).json({ error: "You are not a participant in this game." });
      return;
    }
    if (game.mode === "vs_ai" && game.currentTurn !== 1) {
      res.status(409).json({ error: "AI is still resolving its turn." });
      return;
    }

    let nextState = applyMove(toEngineState(game), { from, to });
    let aiMoves = [];
    if (game.mode === "vs_ai" && nextState.status === "ongoing" && nextState.currentTurn === 2) {
      const aiTurn = applyAiTurn(nextState, game.aiDifficulty);
      nextState = aiTurn.state;
      aiMoves = aiTurn.moves.map(serializeMove);
    }

    const updated =
      nextState.status === "finished"
        ? await completeMatchWithBounty(game, nextState)
        : await updateGameRecord(gameId, nextState);

    res.json({ ...updated, aiMoves });
  } catch (error) {
    if (/Illegal move|Invalid board index|finished/.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

function toEngineState(game) {
  return {
    board: game.board,
    currentTurn: game.currentTurn,
    forcedFrom: game.forcedFrom,
    status: game.status,
    winner: game.winner
  };
}

async function resolveOpponentUserId(currentUserId, requestedOpponentUserId) {
  if (requestedOpponentUserId && requestedOpponentUserId !== currentUserId) {
    const stats = await findPlayerStatsByUserIds([requestedOpponentUserId]);
    return stats.length > 0 ? requestedOpponentUserId : null;
  }

  return null;
}

function isParticipant(game, userId) {
  return game.playerOneUserId === userId || game.playerTwoUserId === userId;
}

function normalizeGameMode(mode) {
  return mode === "vs_ai" ? "vs_ai" : "local_pvp";
}

function normalizeAiDifficulty(difficulty) {
  if (["beginner", "intermediate", "expert"].includes(difficulty)) return difficulty;
  return "beginner";
}
