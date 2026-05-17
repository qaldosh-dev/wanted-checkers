import express from "express";
import { requireAuth } from "../auth/middleware.js";
import { searchPlayerStatsByUsername } from "../playerStatsRepository.js";
import { isUserOnline } from "../socket/presenceService.js";

export const usersRouter = express.Router();

usersRouter.get("/search", requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.q ?? "").trim();
    if (query.length < 2) {
      res.json({ players: [] });
      return;
    }

    const players = await searchPlayerStatsByUsername(query, req.user.id);
    res.json({
      players: players.map((player) => ({
        userId: player.userId,
        username: player.username,
        avatarUrl: player.avatarUrl,
        bounty: player.bounty,
        tier: player.tier,
        isOnline: isUserOnline(player.userId)
      }))
    });
  } catch (error) {
    next(error);
  }
});
