import { randomUUID } from "node:crypto";
import express from "express";
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

export const gameRouter = express.Router();

gameRouter.post("/start", async (req, res, next) => {
  try {
    const game = await createGameRecord(createInitialState());

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

gameRouter.get("/moves/:gameId/:from", async (req, res, next) => {
  try {
    const game = await findGameRecord(req.params.gameId);
    if (!game) {
      res.status(404).json({ error: "Game not found." });
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

gameRouter.post("/move", async (req, res, next) => {
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

    const nextState = applyMove(toEngineState(game), { from, to });
    const updated = await updateGameRecord(gameId, nextState);
    res.json(updated);
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
