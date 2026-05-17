import express from "express";
import { requireAuth } from "../auth/middleware.js";
import { getPlayerRanking, listPlayerStats } from "../playerStatsRepository.js";
import { isValidKazakhstanRegion } from "../regions/kazakhstanRegions.js";

export const playersRouter = express.Router();

playersRouter.get("/leaderboard", async (req, res, next) => {
  try {
    const region = String(req.query.region ?? "").trim();
    if (region && !isValidKazakhstanRegion(region)) {
      res.status(400).json({ error: "Invalid Kazakhstan region." });
      return;
    }

    const players = await listPlayerStats({ region });
    res.json({
      scope: region ? "region" : "global",
      region: region || null,
      players
    });
  } catch (error) {
    next(error);
  }
});

playersRouter.get("/rank/me", requireAuth, async (req, res, next) => {
  try {
    const ranking = await getPlayerRanking(req.user.id);
    res.json({ ranking });
  } catch (error) {
    next(error);
  }
});
