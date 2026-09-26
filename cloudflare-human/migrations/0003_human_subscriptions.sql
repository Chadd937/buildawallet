CREATE TABLE IF NOT EXISTS human_challenges (
  nonce TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  wallet TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS human_sessions (
  token_hash TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  wallet TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS human_payments (
  chain TEXT NOT NULL,
  tx TEXT NOT NULL,
  wallet TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  paid_at INTEGER NOT NULL,
  PRIMARY KEY (chain, tx)
);
CREATE TABLE IF NOT EXISTS human_entitlements (
  chain TEXT NOT NULL,
  wallet TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (chain, wallet)
);
CREATE INDEX IF NOT EXISTS idx_human_challenges_expiry ON human_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_human_sessions_expiry ON human_sessions(expires_at);
