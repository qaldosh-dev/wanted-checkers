import { verifyAccessToken } from "../auth/jwt.js";
import { findUserById } from "../userRepository.js";

export async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token ?? extractBearerToken(socket.handshake.headers.authorization);
    if (!token) throw new Error("Authentication required.");

    const payload = verifyAccessToken(token);
    const user = await findUserById(payload.sub);
    if (!user) throw new Error("User no longer exists.");

    socket.data.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function extractBearerToken(header = "") {
  const [scheme, token] = String(header).split(" ");
  return scheme === "Bearer" ? token : "";
}
