import express from "express";
import { requireAuth } from "../auth/middleware.js";
import {
  acceptFriendship,
  declineFriendship,
  listFriendRequests,
  listFriends,
  requestFriendship
} from "./friendshipService.js";

export const friendshipRouter = express.Router();

friendshipRouter.post("/request", requireAuth, async (req, res, next) => {
  try {
    const result = await requestFriendship(req.user, req.body?.addresseeUserId);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

friendshipRouter.post("/accept", requireAuth, async (req, res, next) => {
  try {
    const result = await acceptFriendship(req.user, req.body?.friendshipId);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

friendshipRouter.post("/decline", requireAuth, async (req, res, next) => {
  try {
    const result = await declineFriendship(req.user, req.body?.friendshipId);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

friendshipRouter.get("/list", requireAuth, async (req, res, next) => {
  try {
    const result = await listFriends(req.user.id);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

friendshipRouter.get("/requests", requireAuth, async (req, res, next) => {
  try {
    const result = await listFriendRequests(req.user.id);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});
