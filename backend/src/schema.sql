CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board JSONB NOT NULL,
  current_turn INTEGER DEFAULT 1,
  forced_from INTEGER,
  status VARCHAR(20) DEFAULT 'ongoing',
  winner INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
