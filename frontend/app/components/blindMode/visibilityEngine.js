export const BLIND_HUNT_MODE = "blind_hunt";

export function isBlindHuntMode(mode) {
  return mode === BLIND_HUNT_MODE || mode === "blind_hunt_local";
}

export function buildVisibleBoardSquares(board, playerNumber) {
  const visibleSquares = new Set();
  if (!Array.isArray(board) || !playerNumber) return visibleSquares;

  for (let index = 0; index < board.length; index += 1) {
    if (!isPlayerPiece(board[index], playerNumber)) continue;
    const { row, col } = playableIndexToBoardCoord(index);

    for (let nextRow = Math.max(0, row - 1); nextRow <= Math.min(7, row + 1); nextRow += 1) {
      for (let nextCol = Math.max(0, col - 1); nextCol <= Math.min(7, col + 1); nextCol += 1) {
        visibleSquares.add(nextRow * 8 + nextCol);
      }
    }
  }

  return visibleSquares;
}

export function isPlayerPiece(piece, playerNumber) {
  if (playerNumber === 1) return piece === 1 || piece === 3;
  if (playerNumber === 2) return piece === 2 || piece === 4;
  return false;
}

export function playableIndexToBoardCoord(index) {
  const row = Math.floor(index / 4);
  const col = (index % 4) * 2 + (row % 2 === 0 ? 1 : 0);
  return { row, col };
}
