CREATE TABLE public.api_accounts (
  user_id uuid PRIMARY KEY,
  plan_id text,
  quota integer NOT NULL DEFAULT 0,
  used integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_accounts TO authenticated;
GRANT ALL ON public.api_accounts TO service_role;
ALTER TABLE public.api_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own account readable" ON public.api_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.api_account_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_hint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX api_account_keys_user_idx ON public.api_account_keys(user_id);
GRANT SELECT ON public.api_account_keys TO authenticated;
GRANT ALL ON public.api_account_keys TO service_role;
ALTER TABLE public.api_account_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own keys readable" ON public.api_account_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.api_usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  key_id uuid,
  endpoint text NOT NULL,
  chain text,
  units integer NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_usage_events_user_idx ON public.api_usage_events(user_id, created_at DESC);
GRANT SELECT ON public.api_usage_events TO authenticated;
GRANT ALL ON public.api_usage_events TO service_role;
ALTER TABLE public.api_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own usage readable" ON public.api_usage_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.api_checkout_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id text NOT NULL,
  chain text NOT NULL,
  payer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX api_checkout_quotes_user_idx ON public.api_checkout_quotes(user_id, created_at DESC);
GRANT SELECT ON public.api_checkout_quotes TO authenticated;
GRANT ALL ON public.api_checkout_quotes TO service_role;
ALTER TABLE public.api_checkout_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own quotes readable" ON public.api_checkout_quotes FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.api_account_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quote_id uuid,
  chain text NOT NULL,
  tx text NOT NULL,
  payer text NOT NULL,
  plan_id text NOT NULL,
  amount_atomic numeric NOT NULL,
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain, tx)
);
GRANT SELECT ON public.api_account_payments TO authenticated;
GRANT ALL ON public.api_account_payments TO service_role;
ALTER TABLE public.api_account_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own payments readable" ON public.api_account_payments FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.api_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.api_rate_limits TO service_role;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hit_api_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hits integer;
BEGIN
  INSERT INTO public.api_rate_limits(bucket, window_start, hits) VALUES (p_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE SET
    hits = CASE WHEN public.api_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds) THEN 1 ELSE public.api_rate_limits.hits + 1 END,
    window_start = CASE WHEN public.api_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds) THEN now() ELSE public.api_rate_limits.window_start END
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END; $$;
REVOKE ALL ON FUNCTION public.hit_api_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_api_rate_limit(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_account_api_units(p_token_hash text, p_cost integer, p_endpoint text, p_chain text)
RETURNS TABLE(plan_id text, quota integer, used integer, remaining integer, batch_limit integer, expires_at timestamptz, allowed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid; v_key uuid; v_plan text; v_quota integer; v_used integer; v_expires timestamptz; v_batch integer;
BEGIN
  IF p_cost < 0 THEN RETURN; END IF;
  SELECT k.user_id, k.id, a.plan_id, a.quota, a.used, a.expires_at
    INTO v_user, v_key, v_plan, v_quota, v_used, v_expires
  FROM public.api_account_keys k JOIN public.api_accounts a ON a.user_id = k.user_id
  WHERE k.token_hash = p_token_hash AND k.revoked_at IS NULL AND a.expires_at > now();
  IF NOT FOUND THEN RETURN; END IF;
  v_batch := CASE v_plan WHEN 'pro' THEN 10 WHEN 'scale' THEN 50 ELSE 0 END;
  UPDATE public.api_account_keys SET last_used_at = now() WHERE id = v_key;
  IF p_cost = 0 THEN
    RETURN QUERY SELECT v_plan, v_quota, v_used, GREATEST(v_quota - v_used, 0), v_batch, v_expires, TRUE; RETURN;
  END IF;
  UPDATE public.api_accounts a SET used = a.used + p_cost, updated_at = now()
  WHERE a.user_id = v_user AND a.used + p_cost <= a.quota
  RETURNING a.used INTO v_used;
  IF NOT FOUND THEN
    INSERT INTO public.api_usage_events(user_id, key_id, endpoint, chain, units, allowed) VALUES (v_user, v_key, left(p_endpoint, 200), left(p_chain, 40), p_cost, FALSE);
    SELECT a.used INTO v_used FROM public.api_accounts a WHERE a.user_id = v_user;
    RETURN QUERY SELECT v_plan, v_quota, v_used, GREATEST(v_quota - v_used, 0), v_batch, v_expires, FALSE; RETURN;
  END IF;
  INSERT INTO public.api_usage_events(user_id, key_id, endpoint, chain, units, allowed) VALUES (v_user, v_key, left(p_endpoint, 200), left(p_chain, 40), p_cost, TRUE);
  RETURN QUERY SELECT v_plan, v_quota, v_used, v_quota - v_used, v_batch, v_expires, TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.consume_account_api_units(text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_account_api_units(text, integer, text, text) TO service_role;