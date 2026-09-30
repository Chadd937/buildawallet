CREATE TABLE IF NOT EXISTS human_email_challenges (
  email_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS human_email_accounts (
  email_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS human_sessions (
  token_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_human_sessions_email_hash ON human_sessions(email_hash);
CREATE INDEX IF NOT EXISTS idx_human_sessions_expires_at ON human_sessions(expires_at);
