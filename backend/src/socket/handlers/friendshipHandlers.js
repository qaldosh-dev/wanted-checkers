import {
  listFriendRequests,
  listFriends
} from "../../friends/friendshipService.js";

export function registerFriendshipHandlers(socket, safely) {
  socket.on("friend:list_refresh", async () => {
    await safely(socket, async () => {
      const friends = await listFriends(socket.data.user.id);
      const requests = await listFriendRequests(socket.data.user.id);
      socket.emit("friend:list_updated", {
        friends: friends.body.friends,
        requests: requests.body.requests
      });
    });
  });
}
