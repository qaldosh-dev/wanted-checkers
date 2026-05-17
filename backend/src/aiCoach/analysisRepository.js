import { query } from "../db.js";

export async function findCachedAnalysis(matchId, userId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT id,
            match_id,
            user_id,
            analysis,
            created_at
     FROM ai_coach_analyses
     WHERE match_id = $1
       AND user_id = $2
     LIMIT 1`,
    [matchId, userId]
  );

  if (result.rowCount === 0) return null;
  return mapAnalysisRow(result.rows[0]);
}

export async function saveAnalysis(matchId, userId, analysis, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `INSERT INTO ai_coach_analyses (match_id, user_id, analysis)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (match_id, user_id)
     DO UPDATE SET analysis = EXCLUDED.analysis
     RETURNING id,
               match_id,
               user_id,
               analysis,
               created_at`,
    [matchId, userId, JSON.stringify(analysis)]
  );

  return mapAnalysisRow(result.rows[0]);
}

export async function countAnalysesToday(userId, options = {}) {
  const executor = options.client ?? { query };
  const result = await executor.query(
    `SELECT COUNT(*)::int AS count
     FROM ai_coach_analyses
     WHERE user_id = $1
       AND created_at >= date_trunc('day', NOW())`,
    [userId]
  );

  return result.rows[0]?.count ?? 0;
}

function mapAnalysisRow(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    userId: row.user_id,
    analysis: row.analysis,
    createdAt: row.created_at
  };
}
