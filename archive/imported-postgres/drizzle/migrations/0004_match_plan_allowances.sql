CREATE OR REPLACE FUNCTION public.consume_machine_api_units_v2(
  p_token_hash TEXT,
  p_cost INTEGER
) RETURNS TABLE(plan_id TEXT, quota INTEGER, used INTEGER, remaining INTEGER, batch_limit INTEGER, expires_at TIMESTAMPTZ, allowed BOOLEAN)
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
  IF p_cost < 0 THEN RETURN; END IF;
  SELECT k.chain, k.wallet, e.plan_id, e.expires_at
  INTO v_chain, v_wallet, v_plan, v_expires
  FROM public.machine_api_keys k
  JOIN public.machine_entitlements e USING (chain, wallet)
  WHERE k.token_hash = p_token_hash AND e.expires_at > now();
  IF NOT FOUND THEN RETURN; END IF;

  SELECT CASE v_plan WHEN 'builder' THEN 100000 WHEN 'pro' THEN 500000 WHEN 'scale' THEN 2000000 END,
         CASE v_plan WHEN 'builder' THEN 0 WHEN 'pro' THEN 10 WHEN 'scale' THEN 50 END
  INTO v_quota, v_batch;

  INSERT INTO public.machine_api_usage(chain, wallet, period_start, used)
  VALUES(v_chain, v_wallet, now(), 0)
  ON CONFLICT(chain, wallet) DO UPDATE
    SET period_start = now(), used = 0
    WHERE public.machine_api_usage.period_start <= now() - interval '30 days';

  IF p_cost = 0 THEN
    SELECT u.used INTO v_used FROM public.machine_api_usage u WHERE u.chain = v_chain AND u.wallet = v_wallet;
    RETURN QUERY SELECT v_plan, v_quota, COALESCE(v_used, 0), v_quota - COALESCE(v_used, 0), v_batch, v_expires, TRUE;
    RETURN;
  END IF;

  UPDATE public.machine_api_usage
  SET used = public.machine_api_usage.used + p_cost
  WHERE chain = v_chain AND wallet = v_wallet
    AND public.machine_api_usage.used + p_cost <= v_quota
  RETURNING public.machine_api_usage.used INTO v_used;

  IF NOT FOUND THEN
    SELECT u.used INTO v_used FROM public.machine_api_usage u WHERE u.chain = v_chain AND u.wallet = v_wallet;
    RETURN QUERY SELECT v_plan, v_quota, COALESCE(v_used, v_quota), GREATEST(v_quota - COALESCE(v_used, v_quota), 0), v_batch, v_expires, FALSE;
    RETURN;
  END IF;
  RETURN QUERY SELECT v_plan, v_quota, v_used, v_quota - v_used, v_batch, v_expires, TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_machine_api_units_v2(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_machine_api_units_v2(TEXT, INTEGER) TO service_role;
