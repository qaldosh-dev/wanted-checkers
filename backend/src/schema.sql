CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board JSONB NOT NULL,
  current_turn INTEGER DEFAULT 1,
  forced_from INTEGER,
  status VARCHAR(20) DEFAULT 'ongoing',
  winner INTEGER,
  match_result JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE games ADD COLUMN IF NOT EXISTS forced_from INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS match_result JSONB;

CREATE TABLE IF NOT EXISTS player_stats (
  player_id INTEGER PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  bounty BIGINT NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  current_win_streak INTEGER NOT NULL DEFAULT 0,
  best_win_streak INTEGER NOT NULL DEFAULT 0,
  tier VARCHAR(40) NOT NULL DEFAULT 'Unknown',
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO player_stats (player_id, display_name)
VALUES
  (1, 'Player 1'),
  (2, 'Player 2')
ON CONFLICT (player_id) DO NOTHING;
