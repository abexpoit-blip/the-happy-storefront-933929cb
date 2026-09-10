-- ============================================================
-- Admin checker panel + merchant/bot API keys.
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/checker-admin-api.sql
-- Idempotent: safe to run again.
-- ============================================================

-- ---------- self_checks: track source (web UI vs external API) ----------
ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';
ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS api_key_id uuid;
ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS submitted_cards jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS refunded_credits integer NOT NULL DEFAULT 0;
ALTER TABLE public.self_checks
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS self_checks_created_idx ON public.self_checks (created_at DESC);

-- ---------- API keys (one key = one bot / merchant) ----------
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  owner_note text,
  key_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  daily_limit integer NOT NULL DEFAULT 5000,
  locked_ip text,
  active boolean NOT NULL DEFAULT true,
  request_count integer NOT NULL DEFAULT 0,
  cards_checked integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read api keys" ON public.api_keys;
CREATE POLICY "admins read api keys" ON public.api_keys
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_api_keys_updated ON public.api_keys;
CREATE TRIGGER trg_api_keys_updated BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_credits_nonneg;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_credits_nonneg CHECK (credits >= 0);

-- ---------- per-day usage counter ----------
CREATE TABLE IF NOT EXISTS public.api_key_usage (
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  cards integer NOT NULL DEFAULT 0,
  requests integer NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, day)
);

GRANT SELECT ON public.api_key_usage TO authenticated;
GRANT ALL ON public.api_key_usage TO service_role;
ALTER TABLE public.api_key_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read api usage" ON public.api_key_usage;
CREATE POLICY "admins read api usage" ON public.api_key_usage
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- service-role helper: verify + charge an API key ----------
-- Returns the key row when the request is allowed, raises otherwise.
CREATE OR REPLACE FUNCTION public.api_key_charge(_key_hash text, _ip text, _cards integer)
RETURNS TABLE (id uuid, label text, credits integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _k RECORD;
  _each integer;
  _need integer;
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

  IF _cards > 0 THEN
    SELECT COALESCE(NULLIF(value,'')::integer, 30) INTO _each
      FROM site_settings WHERE key = 'check_credit_cost';
    _each := GREATEST(COALESCE(_each, 30), 0);
    _need := _each * _cards;
    IF _k.credits < _need THEN RAISE EXCEPTION 'insufficient_credits'; END IF;

    SELECT COALESCE(u.cards, 0) INTO _today FROM api_key_usage u
      WHERE u.api_key_id = _k.id AND u.day = (now() AT TIME ZONE 'utc')::date;
    IF _k.daily_limit > 0 AND COALESCE(_today,0) + _cards > _k.daily_limit THEN
      RAISE EXCEPTION 'daily_limit_reached';
    END IF;

    UPDATE api_keys
       SET credits = credits - _need,
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

  RETURN QUERY SELECT _k.id, _k.label, (SELECT k2.credits FROM api_keys k2 WHERE k2.id = _k.id);
END;
$$;

REVOKE ALL ON FUNCTION public.api_key_charge(text, text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.api_key_refund(_key_id uuid, _credits integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(_credits,0) <= 0 THEN RETURN; END IF;
  UPDATE api_keys SET credits = credits + _credits WHERE id = _key_id;
END;
$$;

REVOKE ALL ON FUNCTION public.api_key_refund(uuid, integer) FROM PUBLIC, anon, authenticated;

-- ---------- admin helpers ----------
CREATE OR REPLACE FUNCTION public.admin_adjust_api_credits(_key_id uuid, _credits integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _left integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE api_keys SET credits = GREATEST(credits + _credits, 0) WHERE id = _key_id
    RETURNING credits INTO _left;
  RETURN COALESCE(_left, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_api_credits(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_api_credits(uuid, integer) TO authenticated;

-- delete checker logs (single run or a whole UTC day)
CREATE OR REPLACE FUNCTION public.admin_delete_checks(_task_id text DEFAULT NULL, _day date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _task_id IS NOT NULL THEN
    DELETE FROM self_checks WHERE task_id = _task_id;
  ELSIF _day IS NOT NULL THEN
    DELETE FROM self_checks WHERE (created_at AT TIME ZONE 'utc')::date = _day;
  ELSE
    RAISE EXCEPTION 'nothing_to_delete';
  END IF;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_checks(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_checks(text, date) TO authenticated;
