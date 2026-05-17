import express from "express";
import { requireAuth } from "../auth/middleware.js";
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
