-- Existing paid blueprint customers receive Pro access for their remaining term.
ALTER TABLE human_entitlements ADD COLUMN plan_id TEXT NOT NULL DEFAULT 'pro';
ALTER TABLE human_payments ADD COLUMN plan_id TEXT NOT NULL DEFAULT 'pro';
CREATE TABLE IF NOT EXISTS human_api_keys (
  chain TEXT NOT NULL,
  wallet TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(chain,wallet)
);
CREATE TABLE IF NOT EXISTS human_api_usage (
  chain TEXT NOT NULL,
  wallet TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(chain,wallet)
);
