import {
  acceptChallenge,
  declineChallenge,
  sendChallenge
} from "../challengeService.js";
import { createMultiplayerGame } from "../gameRoomService.js";

export function registerChallengeHandlers(io, socket, safely) {
  socket.on("challenge:send", async (payload) => {
    await safely(socket, async () => {
      await sendChallenge(socket, payload);
    });
  });

  socket.on("challenge:accept", async (payload) => {
    await safely(socket, async () => {
      const match = acceptChallenge(socket, payload);
      const game = await createMultiplayerGame(io, match);
      io.to(`game:${game.gameId}`).emit("challenge:accepted", {
        challenge: match.challenge,
        game
      });
    });
  });

  socket.on("challenge:decline", async (payload) => {
    await safely(socket, async () => {
      declineChallenge(socket, payload);
    });
  });
}
