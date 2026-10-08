-- Expand prepaid checkout, redemption, agent-account and machine-payment rails to every
-- supported mainnet. Existing Base/Solana rows are preserved.
PRAGMA foreign_keys=OFF;

DROP TRIGGER IF EXISTS account_payment_validate;
DROP TRIGGER IF EXISTS account_payment_activate;
DROP TRIGGER IF EXISTS machine_payment_reserve;
DROP TRIGGER IF EXISTS machine_payment_activate;

CREATE TABLE api_checkout_quotes_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL CHECK(plan_id IN ('builder','pro','scale')),
  chain TEXT NOT NULL CHECK(chain IN ('ethereum','base','arbitrum','optimism','polygon','bnb','avalanche','solana','bitcoin','tron')),
  payer TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  asset TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
INSERT INTO api_checkout_quotes_new
  (id,user_id,plan_id,chain,payer,amount_atomic,asset,decimals,created_at,expires_at,consumed_at)
SELECT id,user_id,plan_id,chain,payer,
  CASE plan_id WHEN 'builder' THEN '15000000' WHEN 'pro' THEN '49000000' WHEN 'scale' THEN '149000000' END,
  'USDC',6,created_at,expires_at,consumed_at
FROM api_checkout_quotes;
DROP TABLE api_checkout_quotes;
ALTER TABLE api_checkout_quotes_new RENAME TO api_checkout_quotes;

CREATE INDEX quotes_user ON api_checkout_quotes(user_id,created_at DESC);

CREATE TABLE api_payment_redemptions_new (
  chain TEXT NOT NULL CHECK(chain IN ('ethereum','base','arbitrum','optimism','polygon','bnb','avalanche','solana','bitcoin','tron')),
  tx TEXT NOT NULL,
  CHECK(chain NOT IN ('ethereum','base','arbitrum','optimism','polygon','bnb','avalanche') OR tx=lower(tx)),
  PRIMARY KEY(chain,tx)
);
INSERT INTO api_payment_redemptions SELECT chain,tx FROM api_payment_redemptions;
DROP TABLE api_payment_redemptions;
ALTER TABLE api_payment_redemptions_new RENAME TO api_payment_redemptions;

CREATE TABLE api_account_payments_new (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, quote_id TEXT NOT NULL UNIQUE,
  chain TEXT NOT NULL, tx TEXT NOT NULL, payer TEXT NOT NULL, plan_id TEXT NOT NULL,
  amount_atomic TEXT NOT NULL, paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(chain NOT IN ('ethereum','base','arbitrum','optimism','polygon','bnb','avalanche') OR tx=lower(tx)),
  UNIQUE(chain,tx)
);
INSERT INTO api_account_payments_new
  (id,user_id,quote_id,chain,tx,payer,plan_id,amount_atomic,paid_at,created_at)
SELECT id,user_id,quote_id,chain,tx,payer,plan_id,amount_atomic,paid_at,created_at
FROM api_account_payments;
DROP TABLE api_account_payments;
ALTER TABLE api_account_payments_new RENAME TO api_account_payments;

CREATE TABLE machine_payments_new (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK(chain IN ('ethereum','base','arbitrum','optimism','polygon','bnb','avalanche','solana','bitcoin','tron')),
  tx TEXT NOT NULL,
  wallet TEXT NOT NULL,
  plan_id TEXT NOT NULL CHECK(plan_id IN ('builder','pro','scale')),
  amount_atomic TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(chain NOT IN ('ethereum','base','arbitrum','optimism','polygon','bnb','avalanche') OR tx=lower(tx)),
  UNIQUE(chain,tx)
);
INSERT INTO machine_payments_new
  (id,chain,tx,wallet,plan_id,amount_atomic,paid_at,created_at)
SELECT id,chain,tx,wallet,plan_id,amount_atomic,paid_at,created_at
FROM machine_payments;
DROP TABLE machine_payments;
ALTER TABLE machine_payments_new RENAME TO machine_payments;

CREATE TABLE machine_agent_accounts_new (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK(chain IN ('ethereum','base','arbitrum','optimism','polygon','bnb','avalanche','solana','bitcoin','tron')),
  wallet TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  total_paid_atomic TEXT NOT NULL DEFAULT '0',
  total_usage_units INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  settlement_threshold_atomic TEXT NOT NULL DEFAULT '1000000',
  UNIQUE(chain,wallet)
);
INSERT INTO machine_agent_accounts_new
  SELECT id,chain,wallet,created_at,last_seen_at,total_paid_atomic,total_usage_units,request_count,settlement_threshold_atomic
  FROM machine_agent_accounts;
DROP TABLE machine_agent_accounts;
ALTER TABLE machine_agent_accounts_new RENAME TO machine_agent_accounts;

CREATE INDEX IF NOT EXISTS idx_machine_agent_ledger_account_time
  ON machine_agent_ledger(account_id,created_at DESC);

CREATE TRIGGER account_payment_validate BEFORE INSERT ON api_account_payments BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM api_checkout_quotes q WHERE q.id=NEW.quote_id AND q.user_id=NEW.user_id
      AND q.chain=NEW.chain AND q.payer=NEW.payer AND q.plan_id=NEW.plan_id
      AND q.consumed_at IS NULL AND q.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND julianday(NEW.paid_at)>=julianday(q.created_at)-630.0/86400
      AND NEW.amount_atomic=q.amount_atomic
  ) THEN RAISE(ABORT,'Invalid, expired or consumed checkout') END);
  INSERT INTO api_payment_redemptions(chain,tx) VALUES(NEW.chain,NEW.tx);
END;

CREATE TRIGGER account_payment_activate AFTER INSERT ON api_account_payments BEGIN
  UPDATE api_checkout_quotes SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.quote_id;
  INSERT INTO api_accounts(user_id,plan_id,quota,used,expires_at)
    VALUES(NEW.user_id,NEW.plan_id,
      (CASE NEW.plan_id WHEN 'builder' THEN 100000 WHEN 'pro' THEN 500000 WHEN 'scale' THEN 2000000 END),
      0,strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'))
    ON CONFLICT(user_id) DO UPDATE SET
      plan_id=excluded.plan_id,
      quota=excluded.quota+(CASE WHEN api_accounts.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN max(api_accounts.quota-api_accounts.used,0) ELSE 0 END),
      used=0,
      expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',max(coalesce(api_accounts.expires_at,''),strftime('%Y-%m-%dT%H:%M:%fZ','now')),'+30 days'),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;

CREATE TRIGGER machine_payment_reserve BEFORE INSERT ON machine_payments BEGIN
  INSERT INTO api_payment_redemptions(chain,tx) VALUES(NEW.chain,NEW.tx);
END;

CREATE TRIGGER machine_payment_activate AFTER INSERT ON machine_payments BEGIN
  INSERT INTO machine_entitlements(chain,wallet,plan_id,expires_at)
    VALUES(NEW.chain,NEW.wallet,NEW.plan_id,strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'))
    ON CONFLICT(chain,wallet) DO UPDATE SET plan_id=excluded.plan_id,
      expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',max(machine_entitlements.expires_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),'+30 days');
END;

PRAGMA foreign_keys=ON;
