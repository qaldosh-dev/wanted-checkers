const socketsByUserId = new Map();

export function registerPresenceSocket(socket) {
  const userId = socket.data.user.id;
  const sockets = socketsByUserId.get(userId) ?? new Map();
  sockets.set(socket.id, socket);
  socketsByUserId.set(userId, sockets);
}

export function unregisterPresenceSocket(socket) {
  const userId = socket.data.user?.id;
  if (!userId) return;

  const sockets = socketsByUserId.get(userId);
  if (!sockets) return;
  sockets.delete(socket.id);
  if (sockets.size === 0) socketsByUserId.delete(userId);
}

export function emitToUser(userId, eventName, payload) {
  for (const socket of socketsByUserId.get(userId)?.values() ?? []) {
    socket.emit(eventName, payload);
  }
}

export function isUserOnline(userId) {
  return Boolean(socketsByUserId.get(userId)?.size);
}

export function getPrimarySocket(userId) {
  return socketsByUserId.get(userId)?.values().next().value ?? null;
}
