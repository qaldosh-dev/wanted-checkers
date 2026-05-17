import express from "express";
import { requireAuth } from "../auth/middleware.js";
import { getOrCreateCoachAnalysis } from "../aiCoach/coachService.js";
import { findReplayForUser, listRecentMatchesForUser } from "./matchRepository.js";

export const matchRouter = express.Router();

matchRouter.get("/recent", requireAuth, async (req, res, next) => {
  try {
    const matches = await listRecentMatchesForUser(req.user.id, 3);
    res.json({ matches });
  } catch (error) {
    next(error);
  }
});

matchRouter.post("/:id/analysis", requireAuth, async (req, res, next) => {
  try {
    const result = await getOrCreateCoachAnalysis(req.params.id, req.user.id);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

matchRouter.get("/:id/replay", requireAuth, async (req, res, next) => {
  try {
    const replay = await findReplayForUser(req.params.id, req.user.id);
    if (!replay) {
      res.status(404).json({ error: "Replay not found." });
      return;
    }

    res.json(replay);
  } catch (error) {
    next(error);
  }
});
