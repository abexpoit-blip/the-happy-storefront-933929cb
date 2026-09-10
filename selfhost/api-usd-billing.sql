-- ============================================================
-- API checker billing in USD ($0.02 per card).
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/api-usd-billing.sql
-- Idempotent: safe to run again.
--
-- Charge order for every API card check:
--   1) the key's own credits (credits_per_usd credits = $1)
--   2) whatever is left is taken from the key owner's account balance
--   3) nothing left anywhere -> insufficient_balance
-- ============================================================

INSERT INTO public.site_settings (key, value)
VALUES ('api_check_price', '0.02')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS charged_credits integer NOT NULL DEFAULT 0;
ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS charged_usd numeric NOT NULL DEFAULT 0;
ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS refunded_usd numeric NOT NULL DEFAULT 0;

-- ---------- verify + charge (credits first, then owner balance) ----------
CREATE OR REPLACE FUNCTION public.api_key_charge_usd(_key_hash text, _ip text, _cards integer)
RETURNS TABLE (
  id uuid,
  label text,
  credits integer,
  balance numeric,
  charged_credits integer,
  charged_usd numeric,
  price_per_card numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _k RECORD;
  _price numeric;
  _per_usd integer;
  _need_usd numeric := 0;
  _credit_cost integer := 0;
  _use_credits integer := 0;
  _use_usd numeric := 0;
  _bal numeric := 0;
  _today integer;
BEGIN
  SELECT * INTO _k FROM api_keys WHERE key_hash = _key_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_key'; END IF;
  IF NOT _k.active THEN RAISE EXCEPTION 'key_disabled'; END IF;

  -- one key = one user: the first caller's IP locks the key
  IF _k.locked_ip IS NULL AND _ip IS NOT NULL AND _ip <> '' THEN
    UPDATE api_keys SET locked_ip = _ip WHERE api_keys.id = _k.id;
    _k.locked_ip := _ip;
  ELSIF _k.locked_ip IS NOT NULL AND _ip IS NOT NULL AND _ip <> '' AND _k.locked_ip <> _ip THEN
    RAISE EXCEPTION 'ip_not_allowed';
  END IF;

  SELECT COALESCE(NULLIF(value,'')::numeric, 0.02) INTO _price
    FROM site_settings WHERE key = 'api_check_price';
  _price := GREATEST(COALESCE(_price, 0.02), 0);

  SELECT COALESCE(NULLIF(value,'')::integer, 1000) INTO _per_usd
    FROM site_settings WHERE key = 'credits_per_usd';
  _per_usd := GREATEST(COALESCE(_per_usd, 1000), 1);

  IF _cards > 0 THEN
    IF _k.daily_limit > 0 THEN
      SELECT COALESCE(u.cards, 0) INTO _today FROM api_key_usage u
        WHERE u.api_key_id = _k.id AND u.day = (now() AT TIME ZONE 'utc')::date;
      IF COALESCE(_today,0) + _cards > _k.daily_limit THEN
        RAISE EXCEPTION 'daily_limit_reached';
      END IF;
    END IF;

    _need_usd := ROUND(_price * _cards, 4);
    _credit_cost := CEIL(_need_usd * _per_usd)::integer;

    -- pay from the key's credits first
    _use_credits := LEAST(GREATEST(_k.credits, 0), _credit_cost);
    _use_usd := ROUND(GREATEST(_credit_cost - _use_credits, 0)::numeric / _per_usd, 4);

    IF _use_usd > 0 THEN
      IF _k.user_id IS NULL THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
      SELECT p.balance INTO _bal FROM profiles p WHERE p.id = _k.user_id FOR UPDATE;
      IF COALESCE(_bal, 0) < _use_usd THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
      UPDATE profiles p SET balance = p.balance - _use_usd WHERE p.id = _k.user_id;
      INSERT INTO balance_transactions (user_id, amount, kind, description)
      VALUES (_k.user_id, -_use_usd, 'api_check',
              'API checker: ' || _cards || ' card(s) via ' || _k.label);
    END IF;

    UPDATE api_keys
       SET credits = credits - _use_credits,
           cards_checked = cards_checked + _cards
     WHERE api_keys.id = _k.id;
  END IF;

  UPDATE api_keys
     SET request_count = request_count + 1, last_used_at = now()
   WHERE api_keys.id = _k.id;

  INSERT INTO api_key_usage (api_key_id, day, cards, requests)
  VALUES (_k.id, (now() AT TIME ZONE 'utc')::date, GREATEST(_cards,0), 1)
  ON CONFLICT (api_key_id, day) DO UPDATE
    SET cards = api_key_usage.cards + GREATEST(_cards,0),
        requests = api_key_usage.requests + 1;

  RETURN QUERY
    SELECT _k.id,
           _k.label,
           (SELECT k2.credits FROM api_keys k2 WHERE k2.id = _k.id),
           COALESCE((SELECT p.balance FROM profiles p WHERE p.id = _k.user_id), 0),
           _use_credits,
           _use_usd,
           _price;
END;
$$;

REVOKE ALL ON FUNCTION public.api_key_charge_usd(text, text, integer) FROM PUBLIC, anon, authenticated;

-- ---------- refund cards the gateway never answered ----------
CREATE OR REPLACE FUNCTION public.api_key_refund_mixed(_key_id uuid, _credits integer, _usd numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF COALESCE(_credits,0) > 0 THEN
    UPDATE api_keys SET credits = credits + _credits WHERE id = _key_id;
  END IF;
  IF COALESCE(_usd,0) > 0 THEN
    SELECT user_id INTO _uid FROM api_keys WHERE id = _key_id;
    IF _uid IS NOT NULL THEN
      UPDATE profiles SET balance = balance + _usd WHERE id = _uid;
      INSERT INTO balance_transactions (user_id, amount, kind, description)
      VALUES (_uid, _usd, 'api_check_refund', 'API checker refund — unanswered card(s)');
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.api_key_refund_mixed(uuid, integer, numeric) FROM PUBLIC, anon, authenticated;

-- ---------- atomically settle unanswered-card refunds ----------
-- Concurrent result polls cannot refund the same task twice.
CREATE OR REPLACE FUNCTION public.settle_api_check_refund(
  _check_id uuid,
  _key_id uuid,
  _answered integer
)
RETURNS TABLE (refunded_credits integer, refunded_usd numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task RECORD;
  _uid uuid;
  _unanswered integer;
  _target_credits integer;
  _target_usd numeric;
  _add_credits integer;
  _add_usd numeric;
BEGIN
  SELECT * INTO _task
    FROM self_checks
   WHERE id = _check_id AND api_key_id = _key_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;

  _unanswered := GREATEST(COALESCE(_task.total, 0) - GREATEST(COALESCE(_answered, 0), 0), 0);
  IF COALESCE(_task.total, 0) > 0 THEN
    _target_credits := FLOOR(COALESCE(_task.charged_credits, 0)::numeric * _unanswered / _task.total)::integer;
    _target_usd := ROUND(COALESCE(_task.charged_usd, 0)::numeric * _unanswered / _task.total, 4);
  ELSE
    _target_credits := 0;
    _target_usd := 0;
  END IF;

  _add_credits := GREATEST(_target_credits - COALESCE(_task.refunded_credits, 0), 0);
  _add_usd := GREATEST(_target_usd - COALESCE(_task.refunded_usd, 0), 0);

  IF _add_credits > 0 THEN
    UPDATE api_keys SET credits = credits + _add_credits WHERE id = _key_id;
  END IF;
  IF _add_usd > 0 THEN
    SELECT user_id INTO _uid FROM api_keys WHERE id = _key_id;
    IF _uid IS NOT NULL THEN
      UPDATE profiles SET balance = balance + _add_usd WHERE id = _uid;
      INSERT INTO balance_transactions (user_id, amount, kind, description)
      VALUES (_uid, _add_usd, 'api_check_refund', 'API checker refund — unanswered card(s)');
    END IF;
  END IF;

  UPDATE self_checks
     SET refunded_credits = COALESCE(refunded_credits, 0) + _add_credits,
         refunded_usd = COALESCE(refunded_usd, 0) + _add_usd
   WHERE id = _check_id;

  RETURN QUERY
    SELECT COALESCE(_task.refunded_credits, 0) + _add_credits,
           COALESCE(_task.refunded_usd, 0) + _add_usd;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_api_check_refund(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
