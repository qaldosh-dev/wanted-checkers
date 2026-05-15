import crypto from "node:crypto";

const DEFAULT_EXPIRES_SECONDS = 60 * 60 * 24 * 7;

export function signAccessToken(user, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresIn ?? DEFAULT_EXPIRES_SECONDS;
  const payload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    iat: now,
    exp: now + expiresIn
  };

  return signJwt(payload);
}

export function verifyAccessToken(token) {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) throw new Error("Invalid token.");

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
  if (!constantEqual(signature, expectedSignature)) throw new Error("Invalid token signature.");

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new Error("Token expired.");
  }

  return payload;
}

function signJwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function sign(value) {
  return crypto
    .createHmac("sha256", getJwtSecret())
    .update(value)
    .digest("base64url");
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production.");
  }
  return secret ?? "wanted-checkers-dev-secret-change-me";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url");
}

function constantEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
