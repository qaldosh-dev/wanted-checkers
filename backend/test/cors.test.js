import test from "node:test";
import assert from "node:assert/strict";
import { allowOrigin, allowedOrigins } from "../src/config/cors.js";

test("CORS allows localhost and configured production frontend origin", () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalClientOrigin = process.env.CLIENT_ORIGIN;
  process.env.FRONTEND_URL = "https://wanted-checkers-1pco.vercel.app";
  delete process.env.CLIENT_ORIGIN;

  assert.equal(allowOrigin("http://localhost:3000"), true);
  assert.equal(allowOrigin("https://wanted-checkers-1pco.vercel.app"), true);
  assert.equal(allowOrigin("https://wanted-checkers-git-preview-user.vercel.app"), true);
  assert.equal(allowOrigin("https://malicious.example.com"), false);
  assert.deepEqual(allowedOrigins(), [
    "http://localhost:3000",
    "https://wanted-checkers-1pco.vercel.app"
  ]);

  restore("FRONTEND_URL", originalFrontendUrl);
  restore("CLIENT_ORIGIN", originalClientOrigin);
});

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
