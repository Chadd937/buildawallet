CREATE TABLE IF NOT EXISTS human_accounts (
  subject_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
