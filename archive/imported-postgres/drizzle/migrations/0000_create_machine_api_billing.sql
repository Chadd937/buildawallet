CREATE TABLE public.machine_challenges (
  nonce TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('base','solana')),
  wallet TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
GRANT ALL ON public.machine_challenges TO service_role;
ALTER TABLE public.machine_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.machine_sessions (
  token_hash TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('base','solana')),
  wallet TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
GRANT ALL ON public.machine_sessions TO service_role;
ALTER TABLE public.machine_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.machine_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain TEXT NOT NULL CHECK (chain IN ('base','solana')),
  tx TEXT NOT NULL,
  wallet TEXT NOT NULL,
  amount_atomic NUMERIC(30,0) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('builder','pro','scale')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chain, tx)
);
GRANT ALL ON public.machine_payments TO service_role;
ALTER TABLE public.machine_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.machine_entitlements (
  chain TEXT NOT NULL CHECK (chain IN ('base','solana')),
  wallet TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('builder','pro','scale')),
  PRIMARY KEY(chain, wallet)
);
GRANT ALL ON public.machine_entitlements TO service_role;
ALTER TABLE public.machine_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.machine_api_keys (
  chain TEXT NOT NULL CHECK (chain IN ('base','solana')),
  wallet TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(chain, wallet),
  FOREIGN KEY(chain, wallet) REFERENCES public.machine_entitlements(chain, wallet) ON DELETE CASCADE
);
GRANT ALL ON public.machine_api_keys TO service_role;
ALTER TABLE public.machine_api_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.machine_api_usage (
  chain TEXT NOT NULL CHECK (chain IN ('base','solana')),
  wallet TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY(chain, wallet),
  FOREIGN KEY(chain, wallet) REFERENCES public.machine_entitlements(chain, wallet) ON DELETE CASCADE
);
GRANT ALL ON public.machine_api_usage TO service_role;
ALTER TABLE public.machine_api_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX machine_challenges_expiry_idx ON public.machine_challenges(expires_at);
CREATE INDEX machine_sessions_expiry_idx ON public.machine_sessions(expires_at);
CREATE INDEX machine_entitlements_expiry_idx ON public.machine_entitlements(expires_at);

CREATE OR REPLACE FUNCTION public.consume_machine_api_units(
  p_token_hash TEXT,
  p_cost INTEGER
) RETURNS TABLE(plan_id TEXT, quota INTEGER, used INTEGER, remaining INTEGER, batch_limit INTEGER, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chain TEXT;
  v_wallet TEXT;
  v_plan TEXT;
  v_expires TIMESTAMPTZ;
  v_quota INTEGER;
  v_batch INTEGER;
  v_used INTEGER;
BEGIN
  SELECT k.chain, k.wallet, e.plan_id, e.expires_at
  INTO v_chain, v_wallet, v_plan, v_expires
  FROM public.machine_api_keys k
  JOIN public.machine_entitlements e USING (chain, wallet)
  WHERE k.token_hash = p_token_hash AND e.expires_at > now();
  IF NOT FOUND THEN RETURN; END IF;

  SELECT CASE v_plan WHEN 'builder' THEN 500 WHEN 'pro' THEN 5000 WHEN 'scale' THEN 25000 END,
         CASE v_plan WHEN 'builder' THEN 0 WHEN 'pro' THEN 10 WHEN 'scale' THEN 50 END
  INTO v_quota, v_batch;

  INSERT INTO public.machine_api_usage(chain, wallet, period_start, used)
  VALUES(v_chain, v_wallet, now(), 0)
  ON CONFLICT(chain, wallet) DO UPDATE
    SET period_start = now(), used = 0
    WHERE public.machine_api_usage.period_start <= now() - interval '30 days';

  UPDATE public.machine_api_usage
  SET used = public.machine_api_usage.used + p_cost
  WHERE chain = v_chain AND wallet = v_wallet
    AND public.machine_api_usage.used + p_cost <= v_quota
  RETURNING public.machine_api_usage.used INTO v_used;
  IF NOT FOUND THEN RETURN QUERY SELECT v_plan, v_quota, v_quota, 0, v_batch, v_expires; RETURN; END IF;
  RETURN QUERY SELECT v_plan, v_quota, v_used, v_quota - v_used, v_batch, v_expires;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_machine_api_units(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_machine_api_units(TEXT, INTEGER) TO service_role;