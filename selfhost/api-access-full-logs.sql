-- ============================================================
-- Full card logs (30 days) + paid API access for users.
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/api-access-full-logs.sql
-- Idempotent: safe to run again.
-- ============================================================

-- ---------- keep the FULL card lines with every run (admin only) ----------
ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS full_cards jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------- API keys belong to a site user ----------
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS api_keys_user_idx ON public.api_keys (user_id);

DROP POLICY IF EXISTS "owner reads own api key" ON public.api_keys;
CREATE POLICY "owner reads own api key" ON public.api_keys
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------- paid API access requests ----------
CREATE TABLE IF NOT EXISTS public.api_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  fee_usd numeric NOT NULL DEFAULT 0,
  purpose text,
  admin_note text,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.api_access_requests TO authenticated;
GRANT ALL ON public.api_access_requests TO service_role;
ALTER TABLE public.api_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own api requests" ON public.api_access_requests;
CREATE POLICY "own api requests" ON public.api_access_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_api_requests_updated ON public.api_access_requests;
CREATE TRIGGER trg_api_requests_updated BEFORE UPDATE ON public.api_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- default price of API access
INSERT INTO public.site_settings (key, value)
VALUES ('api_access_fee', '50')
ON CONFLICT (key) DO NOTHING;

-- ---------- user requests API access; the fee is taken from the balance ----------
CREATE OR REPLACE FUNCTION public.request_api_access(_purpose text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _fee numeric;
  _bal numeric;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM api_access_requests WHERE user_id = _uid AND status = 'pending') THEN
    RAISE EXCEPTION 'request_already_pending';
  END IF;
  IF EXISTS (SELECT 1 FROM api_keys WHERE user_id = _uid AND active) THEN
    RAISE EXCEPTION 'api_already_active';
  END IF;

  SELECT COALESCE(NULLIF(value,'')::numeric, 50) INTO _fee FROM site_settings WHERE key = 'api_access_fee';
  _fee := GREATEST(COALESCE(_fee, 50), 0);

  SELECT balance INTO _bal FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) < _fee THEN RAISE EXCEPTION 'insufficient_balance_%', _fee::text; END IF;

  UPDATE profiles SET balance = balance - _fee WHERE id = _uid;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_fee, 'api_access', 'API access fee');

  INSERT INTO api_access_requests (user_id, fee_usd, purpose)
  VALUES (_uid, _fee, NULLIF(trim(COALESCE(_purpose,'')), ''))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_api_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_api_access(text) TO authenticated;

-- ---------- admin approves / rejects (reject refunds the fee) ----------
CREATE OR REPLACE FUNCTION public.admin_set_api_request(_id uuid, _status text, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _r RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('approved','rejected','pending') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT * INTO _r FROM api_access_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF _status = 'rejected' AND _r.status <> 'rejected' AND _r.fee_usd > 0 THEN
    UPDATE profiles SET balance = balance + _r.fee_usd WHERE id = _r.user_id;
    INSERT INTO balance_transactions (user_id, amount, kind, description)
    VALUES (_r.user_id, _r.fee_usd, 'api_access_refund', 'API access request rejected');
  END IF;

  UPDATE api_access_requests
     SET status = _status, admin_note = COALESCE(_note, admin_note)
   WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_api_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_api_request(uuid, text, text) TO authenticated;

-- ---------- 30-day retention for checker logs ----------
CREATE OR REPLACE FUNCTION public.purge_old_checks(_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer := 0;
BEGIN
  DELETE FROM self_checks WHERE created_at < now() - make_interval(days => GREATEST(COALESCE(_days,30), 1));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_checks(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_old_checks(integer) TO authenticated;
