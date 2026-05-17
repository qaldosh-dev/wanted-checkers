const queue = new Map();

export function joinQueue(socket) {
  leaveQueue(socket.data.user.id);

  const entry = {
    socket,
    user: socket.data.user,
    joinedAt: Date.now()
  };
  const opponent = findOpponent(entry.user.id);

  if (!opponent) {
    queue.set(entry.user.id, entry);
    socket.emit("queue:waiting", { waiting: true });
    return null;
  }

  queue.delete(opponent.user.id);
  return {
    playerOne: opponent,
    playerTwo: entry
  };
}

export function leaveQueue(userId) {
  const entry = queue.get(userId);
  if (!entry) return false;
  queue.delete(userId);
  entry.socket.emit("queue:left", { waiting: false });
  return true;
}

export function removeSocketFromQueue(socketId) {
  for (const [userId, entry] of queue.entries()) {
    if (entry.socket.id === socketId) {
      queue.delete(userId);
      return true;
    }
  }
  return false;
}

function findOpponent(userId) {
  for (const entry of queue.values()) {
    if (entry.user.id !== userId && entry.socket.connected) return entry;
  }
  return null;
}
