import test from "node:test";
import assert from "node:assert/strict";
import {
  signAccessToken,
  signGoogleOnboardingToken,
  verifyAccessToken,
  verifyGoogleOnboardingToken
} from "../src/auth/jwt.js";
import { isGoogleOAuthConfigured } from "../src/auth/google.js";
import {
  hasValidationErrors,
  validateOnboardingPayload,
  validateUsernameParam
} from "../src/auth/validation.js";

test("onboarding validation accepts Google profile setup payload", () => {
  const { data, errors } = validateOnboardingPayload({
    onboardingToken: "token",
    username: "straw_hat",
    city: "Foosha"
  });

  assert.equal(hasValidationErrors(errors), false);
  assert.equal(data.username, "straw_hat");
});

test("onboarding validation rejects invalid usernames", () => {
  const { errors } = validateOnboardingPayload({
    onboardingToken: "",
    username: "!!",
    city: "x".repeat(121)
  });

  assert.equal(errors.onboardingToken, "Google onboarding session is required.");
  assert.equal(errors.username.includes("Username must be"), true);
  assert.equal(errors.city, "City must be 120 characters or fewer.");
});

test("username availability validation normalizes valid usernames", () => {
  const result = validateUsernameParam("Straw_Hat");
  assert.equal(result.username, "straw_hat");
  assert.equal(result.error, "");
});

test("JWT tokens round-trip user identity", () => {
  const token = signAccessToken({
    id: "00000000-0000-0000-0000-000000000001",
    username: "straw_hat",
    email: "luffy@example.com"
  });
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, "00000000-0000-0000-0000-000000000001");
  assert.equal(payload.username, "straw_hat");
  assert.equal(payload.email, "luffy@example.com");
});

test("Google onboarding tokens round-trip verified Google profile", () => {
  const token = signGoogleOnboardingToken({
    googleSubject: "google-sub-1",
    email: "luffy@example.com",
    firstName: "Monkey",
    lastName: "King",
    avatarUrl: "https://example.com/avatar.png"
  });
  const payload = verifyGoogleOnboardingToken(token);

  assert.equal(payload.type, "google_onboarding");
  assert.equal(payload.googleSubject, "google-sub-1");
  assert.equal(payload.email, "luffy@example.com");
});

test("Google OAuth reports enabled when client id exists", () => {
  const original = {
    clientId: process.env.GOOGLE_CLIENT_ID
  };

  delete process.env.GOOGLE_CLIENT_ID;
  assert.equal(isGoogleOAuthConfigured(), false);

  process.env.GOOGLE_CLIENT_ID = "client";
  assert.equal(isGoogleOAuthConfigured(), true);

  restoreEnv("GOOGLE_CLIENT_ID", original.clientId);
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
