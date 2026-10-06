-- Private reporting only; payment collection addresses and entitlement tables stay intact.
CREATE TABLE treasury_x402_receipts (
  chain TEXT NOT NULL CHECK(chain IN ('base','solana')),
  tx TEXT NOT NULL,
  payer TEXT,
  amount_atomic TEXT NOT NULL CHECK(amount_atomic='10000'),
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(chain<>'base' OR tx=lower(tx)),
  PRIMARY KEY(chain,tx)
);
CREATE INDEX treasury_x402_recent ON treasury_x402_receipts(paid_at DESC);
