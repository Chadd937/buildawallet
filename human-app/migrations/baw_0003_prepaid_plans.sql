-- Preserve previous payment rows, entitlements, keys and replay reservations.
CREATE TABLE machine_prepaid_payments (
  id TEXT PRIMARY KEY, chain TEXT NOT NULL CHECK(chain IN ('base','solana')), tx TEXT NOT NULL,
  wallet TEXT NOT NULL, plan_id TEXT NOT NULL CHECK(plan_id IN ('builder','pro','scale')),
  amount_atomic TEXT NOT NULL, paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(chain<>'base' OR tx=lower(tx)), UNIQUE(chain,tx),
  CHECK(amount_atomic=CASE plan_id WHEN 'builder' THEN '15000000' WHEN 'pro' THEN '49000000' WHEN 'scale' THEN '149000000' END)
);
CREATE TRIGGER prepaid_payment_reserve BEFORE INSERT ON machine_prepaid_payments BEGIN
  INSERT INTO api_payment_redemptions(chain,tx) VALUES(NEW.chain,NEW.tx);
END;
CREATE TRIGGER prepaid_payment_activate AFTER INSERT ON machine_prepaid_payments BEGIN
  INSERT INTO machine_entitlements(chain,wallet,plan_id,expires_at)
    VALUES(NEW.chain,NEW.wallet,NEW.plan_id,strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'))
    ON CONFLICT(chain,wallet) DO UPDATE SET plan_id=excluded.plan_id,
      expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',max(machine_entitlements.expires_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),'+30 days');
END;
DROP TRIGGER account_payment_validate;
CREATE TRIGGER account_payment_validate BEFORE INSERT ON api_account_payments BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM api_checkout_quotes q WHERE q.id=NEW.quote_id AND q.user_id=NEW.user_id
      AND q.chain=NEW.chain AND q.payer=NEW.payer AND q.plan_id=NEW.plan_id
      AND q.consumed_at IS NULL AND q.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND julianday(NEW.paid_at)>=julianday(q.created_at)-630.0/86400
      AND NEW.amount_atomic=(CASE q.plan_id WHEN 'builder' THEN '15000000' WHEN 'pro' THEN '49000000' WHEN 'scale' THEN '149000000' END)
  ) THEN RAISE(ABORT,'Invalid, expired or consumed checkout') END);
  INSERT INTO api_payment_redemptions(chain,tx) VALUES(NEW.chain,NEW.tx);
END;
