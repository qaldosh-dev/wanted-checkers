import { findReplayForUser } from "../matches/matchRepository.js";
import { analyzeReplayLocally } from "./heuristicAnalyzer.js";
import { enrichWithGrok } from "./grokCoach.js";
import { countAnalysesToday, findCachedAnalysis, saveAnalysis } from "./analysisRepository.js";

const FREE_ANALYSES_PER_DAY = 3;

export async function getOrCreateCoachAnalysis(matchId, userId) {
  const replay = await findReplayForUser(matchId, userId);
  if (!replay) {
    return { status: 404, body: { error: "Match not found." } };
  }

  const cached = await findCachedAnalysis(matchId, userId);
  if (cached) {
    return {
      status: 200,
      body: {
        analysis: { ...cached.analysis, cached: true },
        usage: await buildUsage(userId)
      }
    };
  }

  const usage = await buildUsage(userId);
  if (usage.remaining <= 0) {
    return {
      status: 402,
      body: {
        error: "AI Coach Pro Required",
        proRequired: true,
        usage
      }
    };
  }

  const localAnalysis = analyzeReplayLocally(replay, userId);
  const analysis = await enrichWithGrok(localAnalysis, replay);
  const saved = await saveAnalysis(matchId, userId, {
    ...analysis,
    matchId,
    replayStepCount: replay.snapshots?.length ?? 0
  });

  return {
    status: 201,
    body: {
      analysis: { ...saved.analysis, cached: false },
      usage: await buildUsage(userId)
    }
  };
}

async function buildUsage(userId) {
  const usedToday = await countAnalysesToday(userId);
  return {
    usedToday,
    limit: FREE_ANALYSES_PER_DAY,
    remaining: Math.max(0, FREE_ANALYSES_PER_DAY - usedToday)
  };
}
