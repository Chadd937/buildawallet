-- Persistent machine-agent identity and payment/usage ledger.
-- Accounts are keyed by the public settlement wallet; no private key or secret is stored.
CREATE TABLE IF NOT EXISTS machine_agent_accounts (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK(chain IN ('base','solana')),
  wallet TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  total_paid_atomic TEXT NOT NULL DEFAULT '0',
  total_spent_atomic TEXT NOT NULL DEFAULT '0',
  settlement_threshold_atomic TEXT NOT NULL DEFAULT '1000000',
  UNIQUE(chain,wallet)
);

CREATE TABLE IF NOT EXISTS machine_agent_ledger (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('x402','prepaid')),
  network TEXT NOT NULL,
  tx TEXT NOT NULL,
  resource TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(account_id,network,tx,resource),
  FOREIGN KEY(account_id) REFERENCES machine_agent_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_machine_agent_ledger_account_time
  ON machine_agent_ledger(account_id,created_at DESC);
