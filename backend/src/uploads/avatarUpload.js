import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Busboy from "busboy";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "avatars");

export function avatarUpload(req, res, next) {
  if (!req.is("multipart/form-data")) {
    next();
    return;
  }

  const busboy = Busboy({
    headers: req.headers,
    limits: {
      fileSize: MAX_AVATAR_BYTES,
      files: 1,
      fields: 20
    }
  });
  const fields = {};
  const fileWrites = [];
  let uploadError = null;

  busboy.on("field", (name, value) => {
    fields[name] = value;
  });

  busboy.on("file", (name, file, info) => {
    if (name !== "avatar") {
      file.resume();
      return;
    }

    const validationError = validateAvatarFile(info);
    if (validationError) {
      uploadError = validationError;
      file.resume();
      return;
    }

    const extension = getAvatarExtension(info);
    const filename = `${crypto.randomUUID()}${extension}`;
    const absolutePath = path.join(UPLOAD_ROOT, filename);
    const publicPath = `/uploads/avatars/${filename}`;
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;

    file.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_AVATAR_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    file.on("limit", () => {
      tooLarge = true;
    });

    fileWrites.push(
      new Promise((resolve, reject) => {
        file.on("end", async () => {
          try {
            if (tooLarge) {
              uploadError = avatarValidationError("Avatar must be 2MB or smaller.");
              resolve();
              return;
            }

            await fs.mkdir(UPLOAD_ROOT, { recursive: true });
            await fs.writeFile(absolutePath, Buffer.concat(chunks));
            req.avatarUrl = publicPath;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        file.on("error", reject);
      })
    );
  });

  busboy.on("error", next);
  busboy.on("finish", async () => {
    try {
      await Promise.all(fileWrites);
      if (uploadError) {
        res.status(400).json({ error: "Validation failed.", fields: { avatar: uploadError.message } });
        return;
      }
      req.body = fields;
      next();
    } catch (error) {
      next(error);
    }
  });

  req.pipe(busboy);
}

export function buildDefaultAvatarUrl(username) {
  return `/api/avatars/default/${encodeURIComponent(username || "wanted")}`;
}

export function defaultAvatarSvg(username) {
  const label = String(username || "wanted")
    .replace(/[^a-zA-Z0-9_ -]/g, "")
    .slice(0, 2)
    .toUpperCase() || "WC";
  const hue = hashToHue(username || "wanted");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="hsl(${hue}, 38%, 24%)"/>
  <rect x="32" y="32" width="448" height="448" rx="32" fill="#d7b36a" stroke="#15110c" stroke-width="18"/>
  <circle cx="256" cy="218" r="92" fill="#15110c"/>
  <rect x="122" y="326" width="268" height="86" rx="43" fill="#15110c"/>
  <text x="256" y="247" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" font-weight="900" fill="#f2c14e">${label}</text>
</svg>`;
}

function validateAvatarFile(info) {
  const extension = path.extname(info.filename || "").toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(info.mimeType)) {
    return avatarValidationError("Avatar must be a JPG, PNG, or WebP image.");
  }
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return avatarValidationError("Avatar file extension must be .jpg, .jpeg, .png, or .webp.");
  }
  return null;
}

function getAvatarExtension(info) {
  const extension = path.extname(info.filename || "").toLowerCase();
  if (extension === ".jpeg") return ".jpg";
  return ALLOWED_EXTENSIONS.has(extension) ? extension : ALLOWED_MIME_TYPES.get(info.mimeType);
}

function avatarValidationError(message) {
  return new Error(message);
}

function hashToHue(value) {
  return Array.from(String(value)).reduce((hash, char) => hash + char.charCodeAt(0) * 17, 0) % 360;
}
