const queue = new Map();

export function joinQueue(socket, options = {}) {
  leaveQueue(socket.data.user.id);

  const entry = {
    socket,
    user: socket.data.user,
    mode: normalizeLiveMode(options.mode),
    joinedAt: Date.now()
  };
  const opponent = findOpponent(entry.user.id, entry.mode);

  if (!opponent) {
    queue.set(entry.user.id, entry);
    socket.emit("queue:waiting", { waiting: true });
    return null;
  }

  queue.delete(opponent.user.id);
  return {
    playerOne: opponent,
    playerTwo: entry,
    mode: entry.mode
  };
}

function normalizeLiveMode(mode) {
  if (mode === "blitz") return "blitz";
  if (mode === "blind_hunt") return "blind_hunt";
  return "multiplayer";
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

function findOpponent(userId, mode) {
  for (const entry of queue.values()) {
    if (entry.user.id !== userId && entry.mode === mode && entry.socket.connected) return entry;
  }
  return null;
}
