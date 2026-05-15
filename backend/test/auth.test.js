import test from "node:test";
import assert from "node:assert/strict";
import { signAccessToken, verifyAccessToken } from "../src/auth/jwt.js";
import { isGoogleOAuthConfigured } from "../src/auth/google.js";
import {
  hasValidationErrors,
  validateLoginPayload,
  validateRegisterPayload
} from "../src/auth/validation.js";

test("register validation accepts complete local identity payload", () => {
  const { data, errors } = validateRegisterPayload({
    firstName: "Monkey",
    lastName: "King",
    username: "straw_hat",
    email: "luffy@example.com",
    city: "Foosha",
    password: "gomugomu123",
    confirmPassword: "gomugomu123"
  });

  assert.equal(hasValidationErrors(errors), false);
  assert.equal(data.email, "luffy@example.com");
});

test("register validation rejects weak or conflicting input", () => {
  const { errors } = validateRegisterPayload({
    firstName: "",
    lastName: "",
    username: "!!",
    email: "bad-email",
    password: "short",
    confirmPassword: "different"
  });

  assert.equal(errors.firstName, "First name is required.");
  assert.equal(errors.username.includes("Username must be"), true);
  assert.equal(errors.email, "Enter a valid email address.");
  assert.equal(errors.password, "Password must be at least 8 characters.");
  assert.equal(errors.confirmPassword, "Passwords do not match.");
});

test("login validation accepts email or username identifier", () => {
  const { data, errors } = validateLoginPayload({
    identifier: "straw_hat",
    password: "gomugomu123"
  });

  assert.equal(hasValidationErrors(errors), false);
  assert.equal(data.identifier, "straw_hat");
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

test("Google OAuth reports disabled until all required env vars exist", () => {
  const original = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI
  };

  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
  assert.equal(isGoogleOAuthConfigured(), false);

  process.env.GOOGLE_CLIENT_ID = "client";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/auth/google/callback";
  assert.equal(isGoogleOAuthConfigured(), true);

  restoreEnv("GOOGLE_CLIENT_ID", original.clientId);
  restoreEnv("GOOGLE_CLIENT_SECRET", original.clientSecret);
  restoreEnv("GOOGLE_REDIRECT_URI", original.redirectUri);
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
