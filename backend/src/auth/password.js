import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
let bcryptModule;

async function getBcrypt() {
  if (bcryptModule !== undefined) return bcryptModule;

  try {
    bcryptModule = await import("bcrypt");
  } catch {
    bcryptModule = null;
  }

  return bcryptModule;
}

export async function hashPassword(password) {
  const bcrypt = await getBcrypt();
  if (bcrypt) return bcrypt.hash(password, 12);

  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  if (storedHash.startsWith("scrypt$")) {
    const [, salt, storedKey] = storedHash.split("$");
    const key = await scrypt(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(storedKey, "hex"), key);
  }

  const bcrypt = await getBcrypt();
  if (!bcrypt) return false;
  return bcrypt.compare(password, storedHash);
}
