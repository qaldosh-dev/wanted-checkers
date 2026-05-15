import express from "express";
import { listPlayerStats } from "../playerStatsRepository.js";

export const playersRouter = express.Router();

playersRouter.get("/leaderboard", async (_req, res, next) => {
  try {
    const players = await listPlayerStats();
    res.json({ players });
  } catch (error) {
    next(error);
  }
});
