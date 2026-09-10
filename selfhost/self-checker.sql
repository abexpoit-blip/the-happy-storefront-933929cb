-- Self-service card checker (users check their own cards with balance).
-- Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS public.self_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id text NOT NULL UNIQUE,
  gate text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.self_checks TO authenticated;
GRANT ALL ON public.self_checks TO service_role;
ALTER TABLE public.self_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own self checks" ON public.self_checks;
CREATE POLICY "own self checks" ON public.self_checks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS self_checks_user_idx ON public.self_checks (user_id, created_at DESC);

INSERT INTO public.site_settings (key, value)
VALUES ('self_check_price', '0.20')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.site_settings (key, value)
VALUES ('self_check_gate', 'CCV_Braintree_Auth')
ON CONFLICT (key) DO NOTHING;

-- Charge the caller for N self-checks (bonus balance is spent first).
CREATE OR REPLACE FUNCTION public.charge_self_check(_cards integer)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _price numeric;
  _cost numeric;
  _bal numeric;
  _bonus numeric;
  _from_bonus numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _cards < 1 OR _cards > 500 THEN RAISE EXCEPTION 'invalid_count'; END IF;

  SELECT COALESCE(NULLIF(value,'')::numeric, 0.20) INTO _price
    FROM site_settings WHERE key = 'self_check_price';
  _price := GREATEST(COALESCE(_price, 0.20), 0);
  _cost := ROUND(_price * _cards, 2);

  SELECT balance, bonus_balance INTO _bal, _bonus FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) + COALESCE(_bonus,0) < _cost THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  _from_bonus := LEAST(COALESCE(_bonus,0), _cost);
  UPDATE profiles
     SET bonus_balance = bonus_balance - _from_bonus,
         balance = balance - (_cost - _from_bonus)
   WHERE id = _uid;

  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_cost, 'self_check', 'Card checker: ' || _cards || ' card(s)');

  RETURN _cost;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_self_check(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_self_check(integer) TO authenticated;
