-- Profile stats + $100 API access with instant key delivery after payment.
-- Idempotent: safe to run multiple times.

-- ---------- API access fee is now $100 ----------
INSERT INTO public.site_settings (key, value)
VALUES ('api_access_fee', '100')
ON CONFLICT (key) DO UPDATE SET value = '100', updated_at = now();

-- ---------- pay once, get the key immediately ----------
-- Charges the access fee from the balance and issues one API key bound to the
-- payer. Returns the plaintext key ONCE (only the SHA-256 hash is stored).
CREATE OR REPLACE FUNCTION public.request_api_access_paid(_purpose text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _fee numeric;
  _bal numeric;
  _raw text;
  _label text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM api_keys WHERE user_id = _uid AND active) THEN
    RAISE EXCEPTION 'api_already_active';
  END IF;

  SELECT COALESCE(NULLIF(value,'')::numeric, 100) INTO _fee FROM site_settings WHERE key = 'api_access_fee';
  _fee := GREATEST(COALESCE(_fee, 100), 0);

  SELECT balance INTO _bal FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) < _fee THEN RAISE EXCEPTION 'insufficient_balance_%', _fee::text; END IF;

  UPDATE profiles SET balance = balance - _fee WHERE id = _uid;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_fee, 'api_access', 'API access fee');

  SELECT COALESCE(NULLIF(username,''), 'user') INTO _label FROM profiles WHERE id = _uid;
  _raw := 'zk_' || encode(gen_random_bytes(24), 'hex');

  INSERT INTO api_keys (label, owner_note, key_hash, prefix, user_id, credits, active)
  VALUES (_label, NULLIF(trim(COALESCE(_purpose,'')), ''),
          encode(sha256(_raw::bytea), 'hex'), substr(_raw, 1, 10), _uid, 0, true);

  INSERT INTO api_access_requests (user_id, fee_usd, purpose, status, admin_note)
  VALUES (_uid, _fee, NULLIF(trim(COALESCE(_purpose,'')), ''), 'approved', 'Key issued automatically after payment');

  RETURN _raw;
END;
$$;

REVOKE ALL ON FUNCTION public.request_api_access_paid(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_api_access_paid(text) TO authenticated;

-- ---------- profile stats for the signed-in user ----------
CREATE OR REPLACE FUNCTION public.my_profile_stats()
RETURNS TABLE (deposited numeric, deposits_count integer, cards_bought integer, orders_count integer, spent numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = auth.uid() AND status = 'approved'), 0)::numeric,
    COALESCE((SELECT COUNT(*) FROM deposits WHERE user_id = auth.uid() AND status = 'approved'), 0)::integer,
    COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
               WHERE o.user_id = auth.uid()), 0)::integer,
    COALESCE((SELECT COUNT(*) FROM orders WHERE user_id = auth.uid()), 0)::integer,
    COALESCE((SELECT SUM(total) FROM orders WHERE user_id = auth.uid()), 0)::numeric;
$$;

REVOKE ALL ON FUNCTION public.my_profile_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_stats() TO authenticated;
