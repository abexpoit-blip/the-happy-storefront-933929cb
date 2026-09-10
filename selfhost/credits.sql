-- ============================================================
-- Check-credit system.
--   * $1 = 1000 credits (site_settings.credits_per_usd)
--   * 1 card check = 30 credits = $0.03 (site_settings.check_credit_cost)
--   * Users buy credits with their balance (bonus balance is spent first).
--   * No credits => no checking anywhere (self checker + refundable cards).
-- Idempotent: safe to run multiple times.
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/credits.sql
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS check_credits integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_check_credits_nonneg;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_check_credits_nonneg CHECK (check_credits >= 0);

INSERT INTO public.site_settings (key, value) VALUES ('credits_per_usd', '1000')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.site_settings (key, value) VALUES ('check_credit_cost', '30')
ON CONFLICT (key) DO NOTHING;
UPDATE public.site_settings SET value = '0.03' WHERE key = 'check_fee';

-- ---------- buy credits with balance ----------
CREATE OR REPLACE FUNCTION public.buy_check_credits(_usd numeric)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rate numeric;
  _credits integer;
  _bal numeric;
  _bonus numeric;
  _from_bonus numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _usd := ROUND(COALESCE(_usd, 0), 2);
  IF _usd < 1 OR _usd > 1000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT COALESCE(NULLIF(value,'')::numeric, 1000) INTO _rate
    FROM site_settings WHERE key = 'credits_per_usd';
  _rate := GREATEST(COALESCE(_rate, 1000), 1);
  _credits := FLOOR(_usd * _rate)::integer;

  SELECT balance, bonus_balance INTO _bal, _bonus FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) + COALESCE(_bonus,0) < _usd THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  _from_bonus := LEAST(COALESCE(_bonus,0), _usd);
  UPDATE profiles
     SET bonus_balance = bonus_balance - _from_bonus,
         balance = balance - (_usd - _from_bonus),
         check_credits = check_credits + _credits
   WHERE id = _uid;

  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_usd, 'credits_buy', 'Bought ' || _credits || ' check credits');

  RETURN _credits;
END;
$$;

REVOKE ALL ON FUNCTION public.buy_check_credits(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_check_credits(numeric) TO authenticated;

-- ---------- self checker: pay with credits ----------
CREATE OR REPLACE FUNCTION public.charge_self_check(_cards integer)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _each integer;
  _need integer;
  _have integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _cards < 1 OR _cards > 500 THEN RAISE EXCEPTION 'invalid_count'; END IF;

  SELECT COALESCE(NULLIF(value,'')::integer, 30) INTO _each
    FROM site_settings WHERE key = 'check_credit_cost';
  _each := GREATEST(COALESCE(_each, 30), 0);
  _need := _each * _cards;

  SELECT check_credits INTO _have FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_have,0) < _need THEN RAISE EXCEPTION 'insufficient_credits'; END IF;

  UPDATE profiles SET check_credits = check_credits - _need WHERE id = _uid;

  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, 0, 'check_credits', 'Card checker: ' || _cards || ' card(s) — ' || _need || ' credits');

  RETURN _need;   -- credits spent
END;
$$;

REVOKE ALL ON FUNCTION public.charge_self_check(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_self_check(integer) TO authenticated;

-- ---------- purchase: refundable cards need credits, not a $ fee ----------
CREATE OR REPLACE FUNCTION public.purchase_product(_product_id uuid, _quantity integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p RECORD;
  _bal numeric;
  _bonus_bal numeric;
  _total numeric;
  _from_bonus numeric;
  _order_id uuid;
  _content text;
  _key RECORD;
  _i integer;
  _left integer;
  _each integer := 0;
  _need integer := 0;
  _credits integer;
  _rate numeric;
  _fee_each numeric := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _quantity < 1 OR _quantity > 50 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  SELECT * INTO _p FROM products WHERE id = _product_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_unavailable'; END IF;

  _total := _p.price * _quantity;

  SELECT COALESCE(NULLIF(value,'')::numeric, 1000) INTO _rate
    FROM site_settings WHERE key = 'credits_per_usd';
  _rate := GREATEST(COALESCE(_rate, 1000), 1);

  IF COALESCE(_p.refundable, false) THEN
    SELECT COALESCE(NULLIF(value,'')::integer, 30) INTO _each
      FROM site_settings WHERE key = 'check_credit_cost';
    _each := GREATEST(COALESCE(_each, 30), 0);
    _need := _each * _quantity;
    _fee_each := ROUND(_each / _rate, 4);
  END IF;

  SELECT balance, bonus_balance, check_credits INTO _bal, _bonus_bal, _credits
    FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) + COALESCE(_bonus_bal,0) < _total THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  IF COALESCE(_credits,0) < _need THEN RAISE EXCEPTION 'insufficient_credits'; END IF;

  INSERT INTO orders (user_id, total, status) VALUES (_uid, _total, 'completed') RETURNING id INTO _order_id;

  IF _p.delivery_type = 'key' THEN
    _content := '';
    FOR _i IN 1.._quantity LOOP
      SELECT * INTO _key FROM product_keys WHERE product_id = _product_id AND is_sold = false ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
      IF NOT FOUND THEN RAISE EXCEPTION 'out_of_stock'; END IF;
      UPDATE product_keys SET is_sold = true, sold_to = _uid, sold_at = now() WHERE id = _key.id;
      _content := _content || _key.content || E'\n';
    END LOOP;
  ELSIF _p.delivery_type = 'download' THEN
    _content := _p.download_url;
  ELSE
    _content := _p.instant_content;
  END IF;

  INSERT INTO order_items (order_id, product_id, title, unit_price, quantity, delivered_content)
  VALUES (_order_id, _p.id, _p.title, _p.price, _quantity, _content);

  _from_bonus := LEAST(COALESCE(_bonus_bal, 0), _total);
  UPDATE profiles
     SET bonus_balance = bonus_balance - _from_bonus,
         balance = balance - (_total - _from_bonus),
         check_credits = check_credits - _need
   WHERE id = _uid;

  UPDATE products SET sold_count = sold_count + _quantity WHERE id = _p.id;

  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_total, 'purchase', _p.title);

  IF _need > 0 THEN
    INSERT INTO balance_transactions (user_id, amount, kind, description)
    VALUES (_uid, 0, 'check_credits', 'Check credits ' || _quantity || ' x ' || _each || ' = ' || _need);
  END IF;

  -- pending checks only: the buyer starts the checker manually
  IF COALESCE(_p.refundable, false) THEN
    FOR _i IN 1.._quantity LOOP
      INSERT INTO card_checks (user_id, order_id, product_id, bin, last_digits, price, status, refunded, fee)
      VALUES (_uid, _order_id, _p.id, _p.bin,
              NULLIF(to_jsonb(_p) ->> 'last_digits', ''),
              _p.price, 'pending', 0, _fee_each);
    END LOOP;
  END IF;

  -- a sold card disappears from the shop
  IF _p.delivery_type = 'key' THEN
    SELECT count(*) INTO _left FROM product_keys WHERE product_id = _p.id AND is_sold = false;
    IF COALESCE(_left, 0) <= 0 THEN
      UPDATE products SET active = false WHERE id = _p.id;
    END IF;
  ELSE
    UPDATE products SET active = false WHERE id = _p.id;
  END IF;

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_product(uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.purchase_product(uuid, integer) TO authenticated;
