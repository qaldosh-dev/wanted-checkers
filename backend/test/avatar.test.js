import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultAvatarUrl,
  defaultAvatarSvg
} from "../src/uploads/avatarUpload.js";

test("default avatar URL is username based", () => {
  assert.equal(buildDefaultAvatarUrl("wanted_user"), "/api/avatars/default/wanted_user");
});

test("default avatar SVG includes sanitized initials", () => {
  const svg = defaultAvatarSvg("<script>");

  assert.equal(svg.includes("<script>"), false);
  assert.equal(svg.includes("SC"), true);
});
