CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  username VARCHAR(40) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT,
  city VARCHAR(120),
  avatar_url TEXT,
  provider VARCHAR(20) NOT NULL DEFAULT 'local',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT users_provider_check CHECK (provider IN ('local', 'google'))
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'player_stats'
      AND column_name = 'player_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'player_stats'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE player_stats RENAME TO player_stats_legacy_mvp;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS player_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bounty BIGINT NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  current_win_streak INTEGER NOT NULL DEFAULT 0,
  best_win_streak INTEGER NOT NULL DEFAULT 0,
  tier VARCHAR(40) NOT NULL DEFAULT 'Unknown',
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board JSONB NOT NULL,
  current_turn INTEGER DEFAULT 1,
  forced_from INTEGER,
  status VARCHAR(20) DEFAULT 'ongoing',
  winner INTEGER,
  player_one_user_id UUID REFERENCES users(id),
  player_two_user_id UUID REFERENCES users(id),
  match_result JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  winner_user_id UUID REFERENCES users(id),
  loser_user_id UUID REFERENCES users(id),
  bounty_gain BIGINT NOT NULL DEFAULT 0,
  bounty_loss BIGINT NOT NULL DEFAULT 0,
  result JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE games ADD COLUMN IF NOT EXISTS forced_from INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player_one_user_id UUID REFERENCES users(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS player_two_user_id UUID REFERENCES users(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS match_result JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS player_stats_bounty_idx ON player_stats (bounty DESC, wins DESC);
CREATE INDEX IF NOT EXISTS games_player_one_idx ON games (player_one_user_id);
CREATE INDEX IF NOT EXISTS games_player_two_idx ON games (player_two_user_id);
