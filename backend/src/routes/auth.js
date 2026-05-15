import express from "express";
import { requireAuth } from "../auth/middleware.js";
import {
  hasValidationErrors,
  validateLoginPayload,
  validateProfileUpdatePayload,
  validateRegisterPayload
} from "../auth/validation.js";
import {
  loginGoogleUserWithCode,
  loginGoogleUser,
  loginLocalUser,
  registerLocalUser
} from "../auth/authService.js";
import {
  buildGoogleAuthorizationUrl,
  isGoogleOAuthConfigured
} from "../auth/google.js";
import { findPlayerStatsByUserId } from "../playerStatsRepository.js";
import { avatarUpload, buildDefaultAvatarUrl } from "../uploads/avatarUpload.js";
import { updateUserProfile } from "../userRepository.js";

export const authRouter = express.Router();

authRouter.post("/register", avatarUpload, async (req, res, next) => {
  try {
    const { data, errors } = validateRegisterPayload(req.body ?? {});
    if (hasValidationErrors(errors)) {
      res.status(400).json({ error: "Validation failed.", fields: errors });
      return;
    }

    const result = await registerLocalUser({
      ...data,
      avatarUrl: req.avatarUrl ?? buildDefaultAvatarUrl(data.username)
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { data, errors } = validateLoginPayload(req.body ?? {});
    if (hasValidationErrors(errors)) {
      res.status(400).json({ error: "Validation failed.", fields: errors });
      return;
    }

    const result = await loginLocalUser(data);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/google", async (req, res, next) => {
  try {
    const result = await loginGoogleUser({
      idToken: req.body?.idToken,
      city: req.body?.city
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

authRouter.get("/google/status", (_req, res) => {
  res.json({
    enabled: isGoogleOAuthConfigured()
  });
});

authRouter.get("/google/url", (_req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      res.status(503).json({ error: "Google login coming soon." });
      return;
    }

    res.json(buildGoogleAuthorizationUrl());
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

authRouter.post("/google/callback", async (req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      res.status(503).json({ error: "Google login coming soon." });
      return;
    }

    const result = await loginGoogleUserWithCode({
      code: req.body?.code,
      city: req.body?.city
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const stats = await findPlayerStatsByUserId(req.user.id);
    res.json({ user: req.user, stats });
  } catch (error) {
    next(error);
  }
});

authRouter.put("/profile", requireAuth, avatarUpload, async (req, res, next) => {
  try {
    const { data, errors } = validateProfileUpdatePayload(req.body ?? {});
    if (hasValidationErrors(errors)) {
      res.status(400).json({ error: "Validation failed.", fields: errors });
      return;
    }

    const user = await updateUserProfile(req.user.id, {
      ...data,
      avatarUrl: (req.avatarUrl ?? data.avatarUrl) || req.user.avatarUrl
    });
    const stats = await findPlayerStatsByUserId(req.user.id);
    res.json({ user, stats });
  } catch (error) {
    next(error);
  }
});
