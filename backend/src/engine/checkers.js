export const EMPTY = 0;
export const P1 = 1;
export const P2 = 2;
export const P1_KING = 3;
export const P2_KING = 4;

export const PLAYERS = {
  P1: 1,
  P2: 2
};

const BOARD_SIZE = 32;
const KING_ROW = {
  [PLAYERS.P1]: 0,
  [PLAYERS.P2]: 7
};

const PIECES = {
  [PLAYERS.P1]: [P1, P1_KING],
  [PLAYERS.P2]: [P2, P2_KING]
};

const ENEMY_PIECES = {
  [PLAYERS.P1]: [P2, P2_KING],
  [PLAYERS.P2]: [P1, P1_KING]
};

const FORWARD_DIRECTIONS = {
  [PLAYERS.P1]: [
    [-1, -1],
    [-1, 1]
  ],
  [PLAYERS.P2]: [
    [1, -1],
    [1, 1]
  ]
};

const KING_DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1]
];

export function createInitialBoard() {
  return Array.from({ length: BOARD_SIZE }, (_, index) => {
    if (index < 12) return P2;
    if (index > 19) return P1;
    return EMPTY;
  });
}

export function createInitialState() {
  const state = {
    board: createInitialBoard(),
    currentTurn: PLAYERS.P1,
    forcedFrom: null,
    status: "ongoing",
    winner: null,
    movesWithoutProgress: 0,
    positionCounts: {}
  };
  state.positionCounts = { [positionKey(state)]: 1 };
  return state;
}

export function rowColFromIndex(index) {
  assertValidIndex(index);
  const row = Math.floor(index / 4);
  const col = (index % 4) * 2 + ((row + 1) % 2);
  return { row, col };
}

export function indexFromRowCol(row, col) {
  if (row < 0 || row > 7 || col < 0 || col > 7) return null;
  if ((row + col) % 2 !== 1) return null;
  return row * 4 + Math.floor(col / 2);
}

export function getLegalMoves(stateOrBoard, maybePlayer, maybeForcedFrom = null) {
  const state = normalizeStateArgs(stateOrBoard, maybePlayer, maybeForcedFrom);
  if (state.status !== "ongoing") return [];

  const indexes =
    state.forcedFrom === null || state.forcedFrom === undefined
      ? state.board.map((_, index) => index)
      : [state.forcedFrom];

  const quietMoves = [];
  const captureMoves = [];

  for (const from of indexes) {
    if (!ownsPiece(state.board[from], state.currentTurn)) continue;
    const pieceMoves = getPieceMoves(state.board, from, state.currentTurn);
    quietMoves.push(...pieceMoves.filter((move) => move.capture === null));
    captureMoves.push(...pieceMoves.filter((move) => move.capture !== null));
  }

  if (state.forcedFrom !== null && state.forcedFrom !== undefined) {
    return captureMoves;
  }

  return captureMoves.length > 0 ? captureMoves : quietMoves;
}

export function getLegalMovesFrom(state, from) {
  assertValidIndex(from);
  return getLegalMoves(state).filter((move) => move.from === from);
}

export function applyMove(state, input) {
  if (state.status !== "ongoing") {
    throw new Error("Game is already finished.");
  }

  const from = Number(input.from);
  const to = Number(input.to);
  assertValidIndex(from);
  assertValidIndex(to);

  const legalMove = getLegalMoves(state).find((move) => move.from === from && move.to === to);
  if (!legalMove) {
    throw new Error("Illegal move.");
  }

  const nextBoard = [...state.board];
  const movingPiece = nextBoard[from];
  nextBoard[from] = EMPTY;

  if (legalMove.capture !== null) {
    nextBoard[legalMove.capture] = EMPTY;
  }

  const { row } = rowColFromIndex(to);
  const promotedPiece = promoteIfNeeded(movingPiece, state.currentTurn, row);
  const promoted = promotedPiece !== movingPiece;
  const progressed = legalMove.capture !== null || promoted;
  const movesWithoutProgress = progressed ? 0 : (state.movesWithoutProgress ?? 0) + 1;
  nextBoard[to] = promotedPiece;

  if (hasNoPieces(nextBoard, opponentOf(state.currentTurn))) {
    return finishState(nextBoard, state.currentTurn, state.currentTurn, {
      movesWithoutProgress,
      positionCounts: state.positionCounts
    });
  }

  if (legalMove.capture !== null && !promoted) {
    const followUps = getPieceMoves(nextBoard, to, state.currentTurn).filter((move) => move.capture !== null);
    if (followUps.length > 0) {
      return applyDrawRules({
        board: nextBoard,
        currentTurn: state.currentTurn,
        forcedFrom: to,
        status: "ongoing",
        winner: null,
        movesWithoutProgress
      }, state);
    }
  }

  const nextPlayer = opponentOf(state.currentTurn);
  if (getLegalMoves({ board: nextBoard, currentTurn: nextPlayer, status: "ongoing", forcedFrom: null }).length === 0) {
    return finishState(nextBoard, nextPlayer, state.currentTurn, {
      movesWithoutProgress,
      positionCounts: state.positionCounts
    });
  }

  return applyDrawRules({
    board: nextBoard,
    currentTurn: nextPlayer,
    forcedFrom: null,
    status: "ongoing",
    winner: null,
    movesWithoutProgress
  }, state);
}

export function serializeMove(move) {
  return {
    from: move.from,
    to: move.to,
    capture: move.capture,
    isCapture: move.capture !== null
  };
}

export function boardIndexToSquare(index) {
  const { row, col } = rowColFromIndex(index);
  return { index, row, col };
}

export function isRepeatedPosition(state) {
  return Number(state.positionCounts?.[positionKey(state)] ?? 0) >= 3;
}

export function isNoProgressDraw(state) {
  return Number(state.movesWithoutProgress ?? 0) >= 30;
}

export function positionKey(state) {
  return JSON.stringify({
    board: state.board,
    currentTurn: state.currentTurn,
    forcedFrom: state.forcedFrom ?? null
  });
}

function getPieceMoves(board, from, player) {
  const piece = board[from];
  if (!ownsPiece(piece, player)) return [];

  return isKing(piece) ? getFlyingKingMoves(board, from, player) : getManMoves(board, from, player);
}

function getManMoves(board, from, player) {
  return [
    ...getManQuietMoves(board, from, player),
    ...getManCaptureMoves(board, from, player)
  ];
}

function getManQuietMoves(board, from, player) {
  const { row, col } = rowColFromIndex(from);
  const moves = [];

  for (const [rowDelta, colDelta] of FORWARD_DIRECTIONS[player]) {
    const adjacent = indexFromRowCol(row + rowDelta, col + colDelta);
    if (adjacent === null) continue;

    if (board[adjacent] === EMPTY) {
      moves.push({ from, to: adjacent, capture: null });
    }
  }

  return moves;
}

function getManCaptureMoves(board, from, player) {
  const { row, col } = rowColFromIndex(from);
  const moves = [];

  for (const [rowDelta, colDelta] of KING_DIRECTIONS) {
    const adjacent = indexFromRowCol(row + rowDelta, col + colDelta);
    const landing = indexFromRowCol(row + rowDelta * 2, col + colDelta * 2);

    if (
      adjacent !== null &&
      landing !== null &&
      board[landing] === EMPTY &&
      ENEMY_PIECES[player].includes(board[adjacent])
    ) {
      moves.push({ from, to: landing, capture: adjacent });
    }
  }

  return moves;
}

function getFlyingKingMoves(board, from, player) {
  const { row, col } = rowColFromIndex(from);
  const moves = [];

  for (const direction of KING_DIRECTIONS) {
    moves.push(...getFlyingKingQuietMoves(board, from, row, col, direction));
    moves.push(...getFlyingKingCaptureMoves(board, from, player, row, col, direction));
  }

  return moves;
}

function getFlyingKingQuietMoves(board, from, row, col, [rowDelta, colDelta]) {
  const moves = [];

  for (const square of walkDiagonal(row, col, rowDelta, colDelta)) {
    if (board[square] !== EMPTY) break;
    moves.push({ from, to: square, capture: null });
  }

  return moves;
}

function getFlyingKingCaptureMoves(board, from, player, row, col, [rowDelta, colDelta]) {
  const moves = [];
  let captured = null;

  for (const square of walkDiagonal(row, col, rowDelta, colDelta)) {
    const piece = board[square];

    if (captured === null) {
      if (piece === EMPTY) continue;
      if (ownsPiece(piece, player)) break;
      captured = square;
      continue;
    }

    if (piece !== EMPTY) break;
    moves.push({ from, to: square, capture: captured });
  }

  return moves;
}

function* walkDiagonal(row, col, rowDelta, colDelta) {
  let nextRow = row + rowDelta;
  let nextCol = col + colDelta;

  while (true) {
    const index = indexFromRowCol(nextRow, nextCol);
    if (index === null) return;
    yield index;
    nextRow += rowDelta;
    nextCol += colDelta;
  }
}

function applyDrawRules(nextState, previousState) {
  const previousKey = positionKey(previousState);
  const previousCounts = {
    ...(previousState.positionCounts ?? {})
  };
  if (!previousCounts[previousKey]) previousCounts[previousKey] = 1;
  const key = positionKey(nextState);
  const positionCounts = {
    ...previousCounts,
    [key]: Number(previousCounts[key] ?? 0) + 1
  };
  const trackedState = {
    ...nextState,
    positionCounts
  };

  if (isRepeatedPosition(trackedState)) {
    return drawState(trackedState, "threefold_repetition");
  }
  if (isNoProgressDraw(trackedState)) {
    return drawState(trackedState, "no_progress");
  }

  return trackedState;
}

function drawState(state, drawReason) {
  return {
    ...state,
    status: "draw",
    winner: null,
    drawReason
  };
}

function finishState(board, currentTurn, winner, metadata = {}) {
  return {
    board,
    currentTurn,
    forcedFrom: null,
    status: "finished",
    winner,
    movesWithoutProgress: metadata.movesWithoutProgress ?? 0,
    positionCounts: metadata.positionCounts ?? {}
  };
}

function promoteIfNeeded(piece, player, row) {
  if (piece === P1 && row === KING_ROW[player]) return P1_KING;
  if (piece === P2 && row === KING_ROW[player]) return P2_KING;
  return piece;
}

function normalizeStateArgs(stateOrBoard, maybePlayer, maybeForcedFrom) {
  if (Array.isArray(stateOrBoard)) {
    return {
      board: stateOrBoard,
      currentTurn: maybePlayer,
      forcedFrom: maybeForcedFrom,
      status: "ongoing"
    };
  }

  return {
    forcedFrom: null,
    status: "ongoing",
    movesWithoutProgress: 0,
    positionCounts: {},
    ...stateOrBoard
  };
}

function hasNoPieces(board, player) {
  return !board.some((piece) => ownsPiece(piece, player));
}

function opponentOf(player) {
  return player === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;
}

function ownsPiece(piece, player) {
  return PIECES[player]?.includes(piece) ?? false;
}

function isKing(piece) {
  return piece === P1_KING || piece === P2_KING;
}

function assertValidIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) {
    throw new Error(`Invalid board index: ${index}`);
  }
}
