import { Server } from "socket.io";
import { createCorsOptions } from "../config/cors.js";
import { authenticateSocket } from "./socketAuth.js";
import {
  joinQueue,
  leaveQueue,
  removeSocketFromQueue
} from "./matchmakingService.js";
import {
  createMultiplayerGame,
  handleMultiplayerMove,
  handleResign,
  joinExistingGame,
  notifyDisconnect
} from "./gameRoomService.js";
import { registerChallengeHandlers } from "./handlers/challengeHandlers.js";
import { registerFriendshipHandlers } from "./handlers/friendshipHandlers.js";
import {
  registerPresenceSocket,
  unregisterPresenceSocket
} from "./presenceService.js";

export function attachSocketServer(httpServer) {
  const corsOptions = createCorsOptions();
  const io = new Server(httpServer, {
    cors: {
      origin: corsOptions.origin,
      methods: ["GET", "POST"],
      allowedHeaders: corsOptions.allowedHeaders,
      credentials: corsOptions.credentials
    }
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    registerPresenceSocket(socket);

    socket.emit("socket:ready", {
      userId: socket.data.user.id,
      username: socket.data.user.username
    });

    socket.on("queue:join", async () => {
      await safely(socket, async () => {
        const match = joinQueue(socket, { mode: "multiplayer" });
        if (match) await createMultiplayerGame(io, match);
      });
    });

    socket.on("queue:join_blitz", async () => {
      await safely(socket, async () => {
        const match = joinQueue(socket, { mode: "blitz" });
        if (match) await createMultiplayerGame(io, match);
      });
    });

    socket.on("queue:join_blind", async () => {
      await safely(socket, async () => {
        const match = joinQueue(socket, { mode: "blind_hunt" });
        if (match) await createMultiplayerGame(io, match);
      });
    });

    socket.on("queue:leave", () => {
      leaveQueue(socket.data.user.id);
    });

    socket.on("game:join", async (payload) => {
      await safely(socket, async () => {
        await joinExistingGame(io, socket, payload?.gameId);
      });
    });

    socket.on("game:move", async (payload) => {
      await safely(socket, async () => {
        await handleMultiplayerMove(io, socket, payload);
      });
    });

    socket.on("game:resign", async (payload) => {
      await safely(socket, async () => {
        await handleResign(io, socket, payload);
      });
    });

    registerChallengeHandlers(io, socket, safely);
    registerFriendshipHandlers(socket, safely);

    socket.on("disconnect", () => {
      removeSocketFromQueue(socket.id);
      unregisterPresenceSocket(socket);
      notifyDisconnect(io, socket);
    });
  });

  return io;
}

async function safely(socket, action) {
  try {
    await action();
  } catch (error) {
    socket.emit("game:error", { message: error.message });
  }
}
