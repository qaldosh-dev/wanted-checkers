const LOCAL_FRONTEND_ORIGINS = ["http://localhost:3000"];
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.vercel\.app$/i;

export function createCorsOptions() {
  return {
    origin: isAllowedOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  };
}

export function isAllowedOrigin(origin, callback) {
  const allowed = allowOrigin(origin);
  if (typeof callback === "function") {
    callback(null, allowed);
  }
  return allowed;
}

export function allowOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins().includes(origin)) return true;
  return VERCEL_PREVIEW_ORIGIN.test(origin);
}

export function allowedOrigins() {
  const configuredOrigins = parseOrigins(process.env.FRONTEND_URL ?? process.env.CLIENT_ORIGIN ?? "");
  return [...new Set([...LOCAL_FRONTEND_ORIGINS, ...configuredOrigins])];
}

function parseOrigins(value) {
  return String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/+$/, ""));
}
