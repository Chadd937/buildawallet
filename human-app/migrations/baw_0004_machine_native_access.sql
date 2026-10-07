-- Machine-native checkout quotes and x402 settlement receipts.
CREATE TABLE IF NOT EXISTS machine_access_quotes (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK(chain IN ('base','solana')),
  wallet TEXT NOT NULL,
  plan_id TEXT NOT NULL CHECK(plan_id IN ('builder','pro','scale')),
  amount_atomic TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  UNIQUE(chain,wallet,id)
);

CREATE TABLE IF NOT EXISTS machine_x402_payments (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  tx TEXT NOT NULL,
  payer TEXT,
  amount_atomic TEXT NOT NULL,
  resource TEXT NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(network,tx)
);
