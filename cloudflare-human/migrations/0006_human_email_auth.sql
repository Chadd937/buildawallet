DROP TABLE IF EXISTS human_email_challenges;
DROP TABLE IF EXISTS human_sessions;
DROP TABLE IF EXISTS human_email_accounts;

CREATE TABLE human_email_accounts (
  email_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE human_email_challenges (
  email_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE human_sessions (
  token_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_human_email_challenges_expires
  ON human_email_challenges(expires_at);

CREATE INDEX IF NOT EXISTS idx_human_sessions_email
  ON human_sessions(email_hash);

CREATE INDEX IF NOT EXISTS idx_human_sessions_expires
  ON human_sessions(expires_at);
