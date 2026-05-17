export function appendReplayMove(moveHistory, previousState, move, nextState, player, options = {}) {
  return [
    ...(moveHistory ?? []),
    buildReplayMove(moveHistory, previousState, move, nextState, player, options)
  ];
}

export function appendReplayEvent(moveHistory, nextState, event) {
  return [
    ...(moveHistory ?? []),
    {
      moveNumber: (moveHistory?.length ?? 0) + 1,
      type: event.type,
      player: event.player,
      boardAfter: [...nextState.board],
      currentTurnAfter: nextState.currentTurn,
      forcedFromAfter: nextState.forcedFrom ?? null,
      statusAfter: nextState.status,
      winnerAfter: nextState.winner ?? null,
      at: event.at ?? new Date().toISOString()
    }
  ];
}

function buildReplayMove(moveHistory, previousState, move, nextState, player, options) {
  const beforePiece = previousState.board[move.from];
  const afterPiece = nextState.board[move.to];

  return {
    moveNumber: (moveHistory?.length ?? 0) + 1,
    type: "move",
    player,
    from: move.from,
    to: move.to,
    capture: move.capture,
    capturedSquares: move.capture === null || move.capture === undefined ? [] : [move.capture],
    promoted: isPromotion(beforePiece, afterPiece),
    boardAfter: [...nextState.board],
    currentTurnAfter: nextState.currentTurn,
    forcedFromAfter: nextState.forcedFrom ?? null,
    statusAfter: nextState.status,
    winnerAfter: nextState.winner ?? null,
    at: options.at ?? new Date().toISOString()
  };
}

function isPromotion(beforePiece, afterPiece) {
  return (beforePiece === 1 && afterPiece === 3) || (beforePiece === 2 && afterPiece === 4);
}
