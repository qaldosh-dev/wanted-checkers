import express from "express";
import { requireAuth } from "../auth/middleware.js";
import {
  hasValidationErrors,
  validateOnboardingPayload,
  validateProfileUpdatePayload,
  validateUsernameParam
} from "../auth/validation.js";
import {
  completeGoogleOnboarding,
  getUsernameAvailability,
  loginGoogleUser
} from "../auth/authService.js";
import { getGoogleClientId, isGoogleOAuthConfigured } from "../auth/google.js";
import { findPlayerStatsByUserId } from "../playerStatsRepository.js";
import { avatarUpload } from "../uploads/avatarUpload.js";
import { updateUserProfile } from "../userRepository.js";

export const authRouter = express.Router();

authRouter.post("/google", async (req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      res.status(503).json({ error: "Google login is not configured" });
      return;
    }

    const result = await loginGoogleUser({
      credential: req.body?.credential
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

authRouter.post("/onboarding", avatarUpload, async (req, res, next) => {
  try {
    const { data, errors } = validateOnboardingPayload(req.body ?? {});
    if (hasValidationErrors(errors)) {
      res.status(400).json({ error: "Validation failed.", fields: errors });
      return;
    }

    const result = await completeGoogleOnboarding({
      ...data,
      avatarUrl: req.avatarUrl ?? data.avatarUrl
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    if (error.message.includes("onboarding") || error.message.includes("token")) {
      res.status(401).json({ error: error.message });
      return;
    }
    next(error);
  }
});

authRouter.get("/username/:username", async (req, res, next) => {
  try {
    const { username, error } = validateUsernameParam(req.params.username);
    if (error) {
      res.status(400).json({ username, available: false, error });
      return;
    }

    res.json(await getUsernameAvailability(username));
  } catch (error) {
    next(error);
  }
});

authRouter.get("/google/status", (_req, res) => {
  const enabled = isGoogleOAuthConfigured();
  res.json({
    enabled,
    clientId: enabled ? getGoogleClientId() : null,
    message: enabled ? null : "Google login is not configured"
  });
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
