CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id TEXT UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  username VARCHAR(40) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  city VARCHAR(120),
  avatar_url TEXT,
  provider VARCHAR(20) NOT NULL DEFAULT 'google',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT users_provider_check CHECK (provider = 'google')
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
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
  position_counts JSONB DEFAULT '{}'::jsonb,
  moves_without_progress INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ongoing',
  winner INTEGER,
  player_one_user_id INTEGER REFERENCES users(id),
  player_two_user_id INTEGER REFERENCES users(id),
  mode VARCHAR(30) DEFAULT 'local_pvp',
  ai_difficulty VARCHAR(30),
  move_history JSONB DEFAULT '[]'::jsonb,
  match_result JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  winner_user_id INTEGER REFERENCES users(id),
  loser_user_id INTEGER REFERENCES users(id),
  bounty_gain BIGINT NOT NULL DEFAULT 0,
  bounty_loss BIGINT NOT NULL DEFAULT 0,
  result JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friendships (
  id SERIAL PRIMARY KEY,
  requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT friendships_no_self_check CHECK (requester_user_id <> addressee_user_id),
  CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted', 'declined'))
);

CREATE TABLE IF NOT EXISTS ai_coach_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analysis JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (match_id, user_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'google';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ALTER COLUMN provider SET DEFAULT 'google';
UPDATE users SET provider = 'google' WHERE provider IS DISTINCT FROM 'google';

DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_provider_check;
  ALTER TABLE users ADD CONSTRAINT users_provider_check CHECK (provider = 'google');
END $$;

ALTER TABLE games ADD COLUMN IF NOT EXISTS forced_from INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS position_counts JSONB DEFAULT '{}'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS moves_without_progress INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player_one_user_id INTEGER REFERENCES users(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS player_two_user_id INTEGER REFERENCES users(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS mode VARCHAR(30) DEFAULT 'local_pvp';
ALTER TABLE games ADD COLUMN IF NOT EXISTS ai_difficulty VARCHAR(30);
ALTER TABLE games ADD COLUMN IF NOT EXISTS move_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS match_result JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users (google_id) WHERE google_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx
  ON friendships (LEAST(requester_user_id, addressee_user_id), GREATEST(requester_user_id, addressee_user_id));
CREATE INDEX IF NOT EXISTS friendships_addressee_status_idx ON friendships (addressee_user_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester_status_idx ON friendships (requester_user_id, status);
CREATE INDEX IF NOT EXISTS ai_coach_analyses_user_created_idx ON ai_coach_analyses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS player_stats_bounty_idx ON player_stats (bounty DESC, wins DESC);
CREATE INDEX IF NOT EXISTS games_player_one_idx ON games (player_one_user_id);
CREATE INDEX IF NOT EXISTS games_player_two_idx ON games (player_two_user_id);
