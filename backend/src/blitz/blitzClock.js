export const BLITZ_TOTAL_MS = 3 * 60 * 1000;
export const BLITZ_MOVE_MS = 10 * 1000;

export function createInitialBlitzState(now = Date.now()) {
  return startTurnClock({
    playerClocks: {
      1: BLITZ_TOTAL_MS,
      2: BLITZ_TOTAL_MS
    },
    totalMs: BLITZ_TOTAL_MS,
    moveLimitMs: BLITZ_MOVE_MS,
    activePlayer: 1
  }, 1, now);
}

export function materializeBlitzState(blitzState, now = Date.now()) {
  if (!blitzState) return null;
  if (blitzState.finished) return blitzState;

  const activePlayer = Number(blitzState.activePlayer ?? 1);
  const turnStartedAtMs = Date.parse(blitzState.turnStartedAt);
  const elapsed = Number.isFinite(turnStartedAtMs) ? Math.max(0, now - turnStartedAtMs) : 0;
  const playerClocks = {
    1: Number(blitzState.playerClocks?.[1] ?? blitzState.playerClocks?.["1"] ?? BLITZ_TOTAL_MS),
    2: Number(blitzState.playerClocks?.[2] ?? blitzState.playerClocks?.["2"] ?? BLITZ_TOTAL_MS)
  };
  playerClocks[activePlayer] = Math.max(0, playerClocks[activePlayer] - elapsed);

  const moveRemainingMs = Math.max(0, Number(blitzState.moveLimitMs ?? BLITZ_MOVE_MS) - elapsed);
  const loser = playerClocks[activePlayer] <= 0 || moveRemainingMs <= 0 ? activePlayer : null;

  return {
    ...blitzState,
    activePlayer,
    playerClocks,
    moveRemainingMs,
    loser,
    winner: loser ? opponentOf(loser) : null,
    timedOut: Boolean(loser)
  };
}

export function startTurnClock(blitzState, activePlayer, now = Date.now()) {
  return {
    ...blitzState,
    activePlayer,
    turnStartedAt: new Date(now).toISOString(),
    moveDeadlineAt: new Date(now + Number(blitzState.moveLimitMs ?? BLITZ_MOVE_MS)).toISOString(),
    moveRemainingMs: Number(blitzState.moveLimitMs ?? BLITZ_MOVE_MS),
    timedOut: false,
    loser: null,
    winner: null
  };
}

export function advanceBlitzAfterMove(blitzState, nextPlayer, now = Date.now()) {
  const materialized = materializeBlitzState(blitzState, now);
  if (materialized?.timedOut) return materialized;
  return startTurnClock(materialized, nextPlayer, now);
}

export function publicBlitzState(blitzState, now = Date.now()) {
  const materialized = materializeBlitzState(blitzState, now);
  if (!materialized) return null;
  return {
    playerClocks: materialized.playerClocks,
    activePlayer: materialized.activePlayer,
    moveRemainingMs: materialized.moveRemainingMs,
    totalMs: materialized.totalMs ?? BLITZ_TOTAL_MS,
    moveLimitMs: materialized.moveLimitMs ?? BLITZ_MOVE_MS,
    turnStartedAt: materialized.turnStartedAt,
    moveDeadlineAt: materialized.moveDeadlineAt
  };
}

function opponentOf(player) {
  return player === 1 ? 2 : 1;
}
