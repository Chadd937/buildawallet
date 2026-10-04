-- One receipt can fund exactly one checkout across both purchase flows.
CREATE TABLE public.api_payment_redemptions (
  chain text NOT NULL,
  tx text NOT NULL,
  PRIMARY KEY(chain, tx)
);
ALTER TABLE public.api_payment_redemptions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.api_payment_redemptions TO service_role;
INSERT INTO public.api_payment_redemptions(chain, tx)
SELECT chain, CASE WHEN chain = 'base' THEN lower(tx) ELSE tx END FROM public.machine_payments
UNION ALL
SELECT chain, CASE WHEN chain = 'base' THEN lower(tx) ELSE tx END FROM public.api_account_payments;

CREATE FUNCTION public.reserve_api_payment_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.chain = 'base' THEN NEW.tx := lower(NEW.tx); END IF;
  INSERT INTO public.api_payment_redemptions(chain, tx) VALUES(NEW.chain, NEW.tx);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_api_payment_receipt() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reserve_machine_receipt BEFORE INSERT ON public.machine_payments
FOR EACH ROW EXECUTE FUNCTION public.reserve_api_payment_receipt();
CREATE TRIGGER reserve_account_receipt BEFORE INSERT ON public.api_account_payments
FOR EACH ROW EXECUTE FUNCTION public.reserve_api_payment_receipt();

CREATE FUNCTION public.activate_api_checkout(p_user_id uuid, p_quote_id uuid, p_tx text, p_paid_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q public.api_checkout_quotes%ROWTYPE;
  a public.api_accounts%ROWTYPE;
  amount integer;
  allowance integer;
  carry integer := 0;
  expiry timestamptz;
BEGIN
  SELECT * INTO q FROM public.api_checkout_quotes
    WHERE id = p_quote_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR q.consumed_at IS NOT NULL OR q.expires_at <= now() THEN
    RAISE EXCEPTION 'Checkout is invalid, expired or already used';
  END IF;
  SELECT CASE q.plan_id WHEN 'builder' THEN 12000000 WHEN 'pro' THEN 39000000 WHEN 'scale' THEN 99000000 END,
    CASE q.plan_id WHEN 'builder' THEN 100000 WHEN 'pro' THEN 500000 WHEN 'scale' THEN 2000000 END
    INTO amount, allowance;
  IF amount IS NULL OR p_paid_at < q.created_at - interval '630 seconds' THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  INSERT INTO public.api_accounts(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO a FROM public.api_accounts WHERE user_id = p_user_id FOR UPDATE;
  expiry := now();
  IF a.expires_at > now() THEN carry := GREATEST(a.quota-a.used, 0); expiry := a.expires_at; END IF;
  expiry := expiry + interval '30 days';
  INSERT INTO public.api_account_payments(user_id,quote_id,chain,tx,payer,plan_id,amount_atomic,paid_at)
    VALUES(p_user_id,q.id,q.chain,p_tx,q.payer,q.plan_id,amount,p_paid_at);
  UPDATE public.api_checkout_quotes SET consumed_at=now() WHERE id=q.id;
  UPDATE public.api_accounts SET plan_id=q.plan_id,quota=carry+allowance,used=0,expires_at=expiry,updated_at=now() WHERE user_id=p_user_id;
  RETURN jsonb_build_object('status','unlocked','plan',q.plan_id,'units',carry+allowance,'expiresAt',expiry);
END; $$;
REVOKE ALL ON FUNCTION public.activate_api_checkout(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_api_checkout(uuid,uuid,text,timestamptz) TO service_role;

CREATE FUNCTION public.activate_machine_payment(p_chain text,p_wallet text,p_plan text,p_tx text,p_paid_at timestamptz,p_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE expiry timestamptz; expected bigint;
BEGIN
  expected := CASE p_plan WHEN 'builder' THEN 12000000 WHEN 'pro' THEN 39000000 WHEN 'scale' THEN 99000000 END;
  IF expected IS NULL OR expected <> p_amount THEN RAISE EXCEPTION 'Plan amount mismatch'; END IF;
  INSERT INTO public.machine_entitlements(chain,wallet,plan_id,expires_at)
    VALUES(p_chain,p_wallet,p_plan,'epoch') ON CONFLICT(chain,wallet) DO NOTHING;
  SELECT expires_at INTO expiry FROM public.machine_entitlements WHERE chain=p_chain AND wallet=p_wallet FOR UPDATE;
  expiry := GREATEST(now(),expiry) + interval '30 days';
  INSERT INTO public.machine_payments(chain,tx,wallet,amount_atomic,paid_at,plan_id)
    VALUES(p_chain,p_tx,p_wallet,p_amount,p_paid_at,p_plan);
  UPDATE public.machine_entitlements SET expires_at=expiry,plan_id=p_plan WHERE chain=p_chain AND wallet=p_wallet;
  RETURN jsonb_build_object('status','unlocked','chain',p_chain,'wallet',p_wallet,'plan',p_plan,'expiresAt',expiry,'tx',p_tx);
END; $$;
REVOKE ALL ON FUNCTION public.activate_machine_payment(text,text,text,text,timestamptz,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_machine_payment(text,text,text,text,timestamptz,bigint) TO service_role;
