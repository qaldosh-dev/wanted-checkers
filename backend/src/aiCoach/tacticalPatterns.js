import {
  EMPTY,
  P1,
  P1_KING,
  P2,
  P2_KING,
  indexFromRowCol,
  rowColFromIndex
} from "../engine/checkers.js";

export function pieceOwner(piece) {
  if (piece === P1 || piece === P1_KING) return 1;
  if (piece === P2 || piece === P2_KING) return 2;
  return 0;
}

export function isKing(piece) {
  return piece === P1_KING || piece === P2_KING;
}

export function isPromotionMove(beforeBoard, move, afterBoard) {
  const before = beforeBoard[move.from];
  const after = afterBoard[move.to];
  return (before === P1 && after === P1_KING) || (before === P2 && after === P2_KING);
}

export function countPieces(board, player) {
  return board.reduce((total, piece) => total + (pieceOwner(piece) === player ? 1 : 0), 0);
}

export function countCenterPieces(board, player) {
  return board.reduce((total, piece, index) => {
    if (pieceOwner(piece) !== player) return total;
    const { row, col } = rowColFromIndex(index);
    return total + (row >= 2 && row <= 5 && col >= 2 && col <= 5 ? 1 : 0);
  }, 0);
}

export function isPromotionAvailable(board, moves, player) {
  return moves.some((move) => {
    const piece = board[move.from];
    if ((player === 1 && piece !== P1) || (player === 2 && piece !== P2)) return false;
    const { row } = rowColFromIndex(move.to);
    return (player === 1 && row === 0) || (player === 2 && row === 7);
  });
}

export function isPieceCapturedByMove(move, index) {
  return move.capture === index || move.capturedSquares?.includes(index);
}

export function countFollowUpCaptures(state, getLegalMoves) {
  if (state.status !== "ongoing") return 0;
  return getLegalMoves(state).filter((move) => move.capture !== null).length;
}

export function countOpenKingLanes(board, index) {
  const piece = board[index];
  if (!isKing(piece)) return 0;

  const owner = pieceOwner(piece);
  let exposedLanes = 0;
  for (const [rowDelta, colDelta] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let enemySeen = false;
    let emptyBeyondEnemy = false;
    const { row, col } = rowColFromIndex(index);
    let nextRow = row + rowDelta;
    let nextCol = col + colDelta;

    while (nextRow >= 0 && nextRow <= 7 && nextCol >= 0 && nextCol <= 7) {
      const nextIndex = indexFromRowCol(nextRow, nextCol);
      if (nextIndex !== null) {
        const nextPiece = board[nextIndex];
        if (nextPiece !== EMPTY && pieceOwner(nextPiece) === owner) break;
        if (nextPiece !== EMPTY && pieceOwner(nextPiece) !== owner) {
          if (enemySeen) break;
          enemySeen = true;
        } else if (enemySeen && nextPiece === EMPTY) {
          emptyBeyondEnemy = true;
        }
      }
      nextRow += rowDelta;
      nextCol += colDelta;
    }

    if (enemySeen && emptyBeyondEnemy) exposedLanes += 1;
  }

  return exposedLanes;
}
