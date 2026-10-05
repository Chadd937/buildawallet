-- Additive application schema. Existing login and legacy tables stay intact.
CREATE TABLE machine_challenges (
  nonce TEXT PRIMARY KEY, chain TEXT NOT NULL CHECK(chain IN ('base','solana')),
  wallet TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT
);
CREATE TABLE machine_sessions (
  token_hash TEXT PRIMARY KEY, chain TEXT NOT NULL CHECK(chain IN ('base','solana')),
  wallet TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE machine_entitlements (
  chain TEXT NOT NULL CHECK(chain IN ('base','solana')), wallet TEXT NOT NULL,
  plan_id TEXT NOT NULL CHECK(plan_id IN ('builder','pro','scale')), expires_at TEXT NOT NULL,
  PRIMARY KEY(chain,wallet)
);
CREATE TABLE machine_api_keys (
  chain TEXT NOT NULL, wallet TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
  PRIMARY KEY(chain,wallet), FOREIGN KEY(chain,wallet) REFERENCES machine_entitlements(chain,wallet)
);
CREATE TABLE machine_api_usage (
  chain TEXT NOT NULL, wallet TEXT NOT NULL, period_start TEXT NOT NULL, used INTEGER NOT NULL CHECK(used>=0),
  PRIMARY KEY(chain,wallet), FOREIGN KEY(chain,wallet) REFERENCES machine_entitlements(chain,wallet)
);
CREATE TABLE api_accounts (
  user_id TEXT PRIMARY KEY, plan_id TEXT, quota INTEGER NOT NULL DEFAULT 0 CHECK(quota>=0),
  used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0), expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE api_account_keys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, token_hint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_used_at TEXT, revoked_at TEXT
);
CREATE TABLE api_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, key_id TEXT,
  endpoint TEXT NOT NULL, chain TEXT, units INTEGER NOT NULL, allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE api_checkout_quotes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL CHECK(plan_id IN ('builder','pro','scale')),
  chain TEXT NOT NULL CHECK(chain IN ('base','solana')), payer TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL, consumed_at TEXT
);
CREATE TABLE api_payment_redemptions (
  chain TEXT NOT NULL CHECK(chain IN ('base','solana')), tx TEXT NOT NULL,
  CHECK(chain<>'base' OR tx=lower(tx)), PRIMARY KEY(chain,tx)
);
CREATE TABLE api_account_payments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, quote_id TEXT NOT NULL UNIQUE,
  chain TEXT NOT NULL, tx TEXT NOT NULL, payer TEXT NOT NULL, plan_id TEXT NOT NULL,
  amount_atomic TEXT NOT NULL, paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(chain<>'base' OR tx=lower(tx)), UNIQUE(chain,tx)
);
CREATE TABLE machine_payments (
  id TEXT PRIMARY KEY, chain TEXT NOT NULL CHECK(chain IN ('base','solana')), tx TEXT NOT NULL,
  wallet TEXT NOT NULL, plan_id TEXT NOT NULL CHECK(plan_id IN ('builder','pro','scale')),
  amount_atomic TEXT NOT NULL, paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(chain<>'base' OR tx=lower(tx)), UNIQUE(chain,tx),
  CHECK(amount_atomic=CASE plan_id WHEN 'builder' THEN '12000000' WHEN 'pro' THEN '39000000' WHEN 'scale' THEN '99000000' END)
);
CREATE TABLE api_rate_limits (bucket TEXT PRIMARY KEY, window_start TEXT NOT NULL, hits INTEGER NOT NULL);
CREATE TABLE human_ai_conversations (
  user_id TEXT PRIMARY KEY, messages TEXT NOT NULL CHECK(json_valid(messages)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX machine_challenges_expiry ON machine_challenges(expires_at);
CREATE INDEX machine_sessions_expiry ON machine_sessions(expires_at);
CREATE INDEX account_keys_user ON api_account_keys(user_id);
CREATE INDEX usage_user ON api_usage_events(user_id,created_at DESC);
CREATE INDEX quotes_user ON api_checkout_quotes(user_id,created_at DESC);

CREATE TRIGGER account_key_limit BEFORE INSERT ON api_account_keys
WHEN (SELECT count(*) FROM api_account_keys WHERE user_id=NEW.user_id AND revoked_at IS NULL)>=10
BEGIN SELECT RAISE(ABORT,'At most 10 active keys are allowed'); END;

-- Receipt reservation, quote consumption and entitlement renewal are one statement.
CREATE TRIGGER account_payment_validate BEFORE INSERT ON api_account_payments BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM api_checkout_quotes q WHERE q.id=NEW.quote_id AND q.user_id=NEW.user_id
      AND q.chain=NEW.chain AND q.payer=NEW.payer AND q.plan_id=NEW.plan_id
      AND q.consumed_at IS NULL AND q.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND julianday(NEW.paid_at)>=julianday(q.created_at)-630.0/86400
      AND NEW.amount_atomic=(CASE q.plan_id WHEN 'builder' THEN '12000000' WHEN 'pro' THEN '39000000' WHEN 'scale' THEN '99000000' END)
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

-- A short-lived row lets the quota decision and its audit event be atomic.
-- The application inserts and deletes it in a D1 batch transaction.
CREATE TABLE api_meter_requests (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('account','wallet')),
  user_id TEXT, key_id TEXT, chain TEXT, wallet TEXT,
  endpoint TEXT NOT NULL, request_chain TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost>=0),
  plan_id TEXT NOT NULL, quota INTEGER NOT NULL, used INTEGER NOT NULL,
  batch_limit INTEGER NOT NULL, expires_at TEXT NOT NULL, allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
  period_start TEXT
);
CREATE TRIGGER account_meter AFTER INSERT ON api_meter_requests WHEN NEW.kind='account' BEGIN
  UPDATE api_account_keys SET last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.key_id;
  UPDATE api_accounts SET used=NEW.used,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE user_id=NEW.user_id AND NEW.allowed=1 AND NEW.cost>0;
  INSERT INTO api_usage_events(user_id,key_id,endpoint,chain,units,allowed)
    SELECT NEW.user_id,NEW.key_id,substr(NEW.endpoint,1,200),substr(NEW.request_chain,1,40),NEW.cost,NEW.allowed WHERE NEW.cost>0;
END;
CREATE TRIGGER wallet_meter AFTER INSERT ON api_meter_requests WHEN NEW.kind='wallet' BEGIN
  INSERT INTO machine_api_usage(chain,wallet,period_start,used) VALUES(NEW.chain,NEW.wallet,NEW.period_start,NEW.used)
    ON CONFLICT(chain,wallet) DO UPDATE SET period_start=excluded.period_start,used=excluded.used;
END;
