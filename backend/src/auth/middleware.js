import { verifyAccessToken } from "./jwt.js";
import { findUserById } from "../userRepository.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const payload = verifyAccessToken(token);
    const user = await findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: "User no longer exists." });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}
