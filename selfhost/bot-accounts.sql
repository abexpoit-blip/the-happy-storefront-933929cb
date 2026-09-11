-- Telegram bot accounts wired into the website (idempotent).
-- Run on the VPS:
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/bot-accounts.sql

-- ---------- bot account registry ----------
CREATE TABLE IF NOT EXISTS public.telegram_accounts (
  telegram_id bigint PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  username text,
  first_name text,
  gate text,
  banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_accounts TO service_role;
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS telegram_accounts_user_idx ON public.telegram_accounts (user_id);

-- ---------- referral bonus is 10 cents per successful referred deposit ----------
INSERT INTO public.site_settings (key, value)
VALUES ('referral_bonus', '0.10')
ON CONFLICT (key) DO UPDATE SET value = '0.10', updated_at = now();

-- ---------- charge / refund a bot check straight from the USD balance ----------
CREATE OR REPLACE FUNCTION public.bot_check_price()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(
    COALESCE((SELECT NULLIF(value,'')::numeric FROM site_settings WHERE key = 'check_credit_cost'), 30)
    / GREATEST(COALESCE((SELECT NULLIF(value,'')::numeric FROM site_settings WHERE key = 'credits_per_usd'), 1000), 1)
  , 4);
$$;

CREATE OR REPLACE FUNCTION public.bot_charge_check(_user_id uuid, _cards integer)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _price numeric := public.bot_check_price();
  _cost numeric;
  _bal numeric;
BEGIN
  IF _cards IS NULL OR _cards < 1 THEN RAISE EXCEPTION 'no_cards'; END IF;
  _cost := round(_price * _cards, 2);

  SELECT balance INTO _bal FROM profiles WHERE id = _user_id FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF _bal < _cost THEN RAISE EXCEPTION 'insufficient_balance_%', _cost::text; END IF;

  UPDATE profiles SET balance = balance - _cost WHERE id = _user_id;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_user_id, -_cost, 'bot_check', _cards::text || ' card(s) checked from Telegram bot');

  RETURN _cost;
END;
$$;

CREATE OR REPLACE FUNCTION public.bot_refund_check(_user_id uuid, _amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(_amount, 0) <= 0 THEN RETURN 0; END IF;
  UPDATE profiles SET balance = balance + _amount WHERE id = _user_id;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_user_id, _amount, 'bot_check_refund', 'Refund for cards the gateway did not answer');
  RETURN _amount;
END;
$$;

-- ---------- $100 API access for a bot account (same rules as the website) ----------
CREATE OR REPLACE FUNCTION public.bot_purchase_api_key(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fee numeric;
  _bal numeric;
  _raw text;
  _label text;
BEGIN
  IF EXISTS (SELECT 1 FROM api_keys WHERE user_id = _user_id AND active) THEN
    RAISE EXCEPTION 'api_already_active';
  END IF;

  SELECT COALESCE(NULLIF(value,'')::numeric, 100) INTO _fee FROM site_settings WHERE key = 'api_access_fee';
  _fee := GREATEST(COALESCE(_fee, 100), 0);

  SELECT balance INTO _bal FROM profiles WHERE id = _user_id FOR UPDATE;
  IF COALESCE(_bal,0) < _fee THEN RAISE EXCEPTION 'insufficient_balance_%', _fee::text; END IF;

  UPDATE profiles SET balance = balance - _fee WHERE id = _user_id;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_user_id, -_fee, 'api_access', 'API access fee (Telegram bot)');

  SELECT COALESCE(NULLIF(username,''), 'bot-user') INTO _label FROM profiles WHERE id = _user_id;
  _raw := 'zk_' || encode(gen_random_bytes(24), 'hex');

  INSERT INTO api_keys (label, owner_note, key_hash, prefix, user_id, credits, active)
  VALUES (_label, 'Telegram bot', encode(sha256(_raw::bytea), 'hex'), substr(_raw, 1, 10), _user_id, 0, true);

  INSERT INTO api_access_requests (user_id, fee_usd, purpose, status, admin_note)
  VALUES (_user_id, _fee, 'Telegram bot', 'approved', 'Key issued automatically after payment');

  RETURN _raw;
END;
$$;

REVOKE ALL ON FUNCTION public.bot_charge_check(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bot_refund_check(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bot_purchase_api_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_check_price() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_charge_check(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_refund_check(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_purchase_api_key(uuid) TO service_role;

-- ---------- bot checks live in the same table as web/API checks ----------
ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS refunded_usd numeric NOT NULL DEFAULT 0;
