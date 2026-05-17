import { applyMove, createInitialBoard, getLegalMoves } from "../engine/checkers.js";
import {
  countCenterPieces,
  countFollowUpCaptures,
  countOpenKingLanes,
  countPieces,
  isPieceCapturedByMove,
  isPromotionAvailable,
  isPromotionMove
} from "./tacticalPatterns.js";

const MAX_INSIGHTS = 8;

export function analyzeReplayLocally(replay, userId) {
  const perspectivePlayer = playerNumberForUser(replay, userId);
  const moves = replay.moves ?? [];
  const insights = [];
  const initialBoard = replay.initialBoard ?? createInitialBoard();

  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    if (move.type !== "move") continue;

    const beforeBoard = index === 0 ? initialBoard : moves[index - 1].boardAfter;
    const afterBoard = move.boardAfter;
    if (!beforeBoard || !afterBoard) continue;

    const forcedFrom = index === 0 ? null : moves[index - 1].forcedFromAfter ?? null;
    const stateBefore = {
      board: beforeBoard,
      currentTurn: move.player,
      forcedFrom,
      status: "ongoing",
      winner: null
    };
    const legalMoves = safeLegalMoves(stateBefore);
    const actualMove = legalMoves.find((candidate) => candidate.from === move.from && candidate.to === move.to) ?? move;
    const afterState = {
      board: afterBoard,
      currentTurn: move.currentTurnAfter ?? opponentOf(move.player),
      forcedFrom: move.forcedFromAfter ?? null,
      status: move.statusAfter ?? "ongoing",
      winner: move.winnerAfter ?? null
    };
    const opponentMoves = safeLegalMoves(afterState);
    const opponentCaptures = opponentMoves.filter((candidate) => candidate.capture !== null);
    const isOwnMove = move.player === perspectivePlayer;

    maybePush(insights, missedCaptureInsight(move, legalMoves, beforeBoard, isOwnMove));
    maybePush(insights, missedDoubleCaptureInsight(move, legalMoves, actualMove, stateBefore, afterState, beforeBoard, isOwnMove));
    maybePush(insights, promotionMistakeInsight(move, legalMoves, beforeBoard, afterBoard, isOwnMove));
    maybePush(insights, tacticalBlunderInsight(move, opponentCaptures, afterBoard, isOwnMove));
    maybePush(insights, unsafeKingInsight(move, opponentCaptures, afterBoard, isOwnMove));
    maybePush(insights, exposedKingLaneInsight(move, afterBoard, isOwnMove));
    maybePush(insights, strongTacticalPlayInsight(move, beforeBoard, afterBoard, opponentCaptures, isOwnMove));
    maybePush(insights, smartDefenseInsight(move, beforeBoard, afterBoard, opponentCaptures, isOwnMove));
  }

  const selected = insights
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || left.moveNumber - right.moveNumber)
    .slice(0, MAX_INSIGHTS)
    .map((insight, index) => ({
      id: `${insight.type}-${insight.moveNumber}-${index + 1}`,
      ...insight
    }));

  return {
    provider: "local",
    generatedAt: new Date().toISOString(),
    perspectivePlayer,
    summary: buildSummary(selected),
    insights: selected
  };
}

function missedCaptureInsight(move, legalMoves, beforeBoard, isOwnMove) {
  const captureMoves = legalMoves.filter((candidate) => candidate.capture !== null);
  if (captureMoves.length === 0 || move.capture !== null) return null;
  return buildInsight({
    move,
    step: Math.max(0, move.moveNumber - 1),
    boardSnapshot: beforeBoard,
    severity: "critical",
    type: "missed_capture",
    label: "Missed Capture",
    tacticalLabel: "Critical Mistake",
    explanationSeed: subject(isOwnMove, "missed a mandatory capture opportunity", "missed a capture opportunity")
  });
}

function missedDoubleCaptureInsight(move, legalMoves, actualMove, stateBefore, afterState, beforeBoard, isOwnMove) {
  const captureMoves = legalMoves.filter((candidate) => candidate.capture !== null);
  if (captureMoves.length < 2 || move.capture === null) return null;

  const bestContinuation = Math.max(
    ...captureMoves.map((candidate) => countFollowUpCaptures(applyMove(stateBefore, candidate), getLegalMoves))
  );
  const actualContinuation = countFollowUpCaptures(afterState, getLegalMoves);

  if (bestContinuation <= actualContinuation) return null;

  return buildInsight({
    move,
    step: Math.max(0, move.moveNumber - 1),
    boardSnapshot: beforeBoard,
    severity: bestContinuation - actualContinuation >= 2 ? "high" : "medium",
    type: "missed_double_capture",
    label: "Missed Double Capture",
    tacticalLabel: "Tactical Opportunity",
    explanationSeed: subject(
      isOwnMove,
      "chose a capture line but left a stronger multi-capture sequence available",
      "left a stronger multi-capture sequence available"
    )
  });
}

function promotionMistakeInsight(move, legalMoves, beforeBoard, afterBoard, isOwnMove) {
  if (move.promoted || !isPromotionAvailable(beforeBoard, legalMoves, move.player)) return null;
  if (isPromotionMove(beforeBoard, move, afterBoard)) return null;

  return buildInsight({
    move,
    step: Math.max(0, move.moveNumber - 1),
    boardSnapshot: beforeBoard,
    severity: "medium",
    type: "promotion_mistake",
    label: "Promotion Missed",
    tacticalLabel: "Tempo Loss",
    explanationSeed: subject(isOwnMove, "had a path to king promotion but played elsewhere", "passed up a promotion route")
  });
}

function tacticalBlunderInsight(move, opponentCaptures, afterBoard, isOwnMove) {
  if (!opponentCaptures.some((candidate) => isPieceCapturedByMove(candidate, move.to))) return null;

  return buildInsight({
    move,
    step: move.moveNumber,
    boardSnapshot: afterBoard,
    severity: "high",
    type: "tactical_blunder",
    label: "Piece Left Hanging",
    tacticalLabel: "Critical Mistake",
    explanationSeed: subject(isOwnMove, "moved into a direct capture threat", "created a direct capture target")
  });
}

function unsafeKingInsight(move, opponentCaptures, afterBoard, isOwnMove) {
  if (!move.promoted && ![3, 4].includes(afterBoard[move.to])) return null;
  if (!opponentCaptures.some((candidate) => isPieceCapturedByMove(candidate, move.to))) return null;

  return buildInsight({
    move,
    step: move.moveNumber,
    boardSnapshot: afterBoard,
    severity: "critical",
    type: "unsafe_king_positioning",
    label: "Unsafe King",
    tacticalLabel: "King Under Fire",
    explanationSeed: subject(isOwnMove, "created a king but placed it on a capturable lane", "left a king on a capturable lane")
  });
}

function exposedKingLaneInsight(move, afterBoard, isOwnMove) {
  if (![3, 4].includes(afterBoard[move.to])) return null;
  const exposedLanes = countOpenKingLanes(afterBoard, move.to);
  if (exposedLanes === 0) return null;

  return buildInsight({
    move,
    step: move.moveNumber,
    boardSnapshot: afterBoard,
    severity: exposedLanes > 1 ? "medium" : "low",
    type: "exposed_king_lane",
    label: "Exposed King Lane",
    tacticalLabel: "King Safety",
    explanationSeed: subject(isOwnMove, "left a king aligned with long diagonal pressure", "left long diagonal pressure against a king")
  });
}

function strongTacticalPlayInsight(move, beforeBoard, afterBoard, opponentCaptures, isOwnMove) {
  if (move.capture === null && !move.promoted) return null;

  const centerGain = countCenterPieces(afterBoard, move.player) - countCenterPieces(beforeBoard, move.player);
  if (opponentCaptures.length > 0 && centerGain <= 0 && !move.promoted) return null;

  return buildInsight({
    move,
    step: move.moveNumber,
    boardSnapshot: afterBoard,
    severity: move.promoted || move.capture !== null ? "medium" : "low",
    type: "strong_tactical_play",
    label: move.promoted ? "King Breakthrough" : "Strong Tactical Play",
    tacticalLabel: move.promoted ? "Power Move" : "Initiative",
    explanationSeed: subject(isOwnMove, "found a move that improved tactical control", "found a move that improved tactical control")
  });
}

function smartDefenseInsight(move, beforeBoard, afterBoard, opponentCaptures, isOwnMove) {
  if (move.capture !== null || move.promoted || opponentCaptures.length > 0) return null;
  const ownBefore = countPieces(beforeBoard, move.player);
  const ownAfter = countPieces(afterBoard, move.player);
  if (ownBefore !== ownAfter) return null;

  const centerAfter = countCenterPieces(afterBoard, move.player);
  if (centerAfter < 2) return null;

  return buildInsight({
    move,
    step: move.moveNumber,
    boardSnapshot: afterBoard,
    severity: "low",
    type: "smart_defense",
    label: "Smart Defense",
    tacticalLabel: "Stabilizing Move",
    explanationSeed: subject(isOwnMove, "made a quiet move that avoided immediate counterplay", "made a quiet move that reduced immediate counterplay")
  });
}

function buildInsight({ move, step, boardSnapshot, severity, type, label, tacticalLabel, explanationSeed }) {
  return {
    moveNumber: move.moveNumber,
    step,
    player: move.player,
    severity,
    type,
    label,
    tacticalLabel,
    explanationSeed,
    explanation: localExplanation({ moveNumber: move.moveNumber, severity, label, explanationSeed }),
    boardSnapshot
  };
}

function maybePush(collection, insight) {
  if (insight) collection.push(insight);
}

function safeLegalMoves(state) {
  try {
    return getLegalMoves(state);
  } catch {
    return [];
  }
}

function playerNumberForUser(replay, userId) {
  if (replay.players?.playerOne?.userId === userId) return 1;
  if (replay.players?.playerTwo?.userId === userId) return 2;
  return 1;
}

function opponentOf(player) {
  return player === 1 ? 2 : 1;
}

function subject(isOwnMove, ownText, opponentText) {
  return isOwnMove ? `You ${ownText}.` : `Your opponent ${opponentText}.`;
}

function localExplanation({ moveNumber, severity, label, explanationSeed }) {
  return `${label} on move ${moveNumber}: ${explanationSeed} Severity: ${severity}.`;
}

function buildSummary(insights) {
  if (insights.length === 0) {
    return "No major tactical mistakes were detected. The match was decided by small positional choices.";
  }

  const criticalCount = insights.filter((insight) => ["critical", "high"].includes(insight.severity)).length;
  return criticalCount > 0
    ? `AI Coach found ${criticalCount} high-impact moment${criticalCount === 1 ? "" : "s"} worth reviewing.`
    : `AI Coach found ${insights.length} positional coaching moment${insights.length === 1 ? "" : "s"}.`;
}

function severityRank(severity) {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  }[severity] ?? 0;
}
