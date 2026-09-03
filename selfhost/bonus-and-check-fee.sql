-- ============================================================
-- 1) Separate bonus balance (referral money) that can also buy cards
-- 2) Per-check fee (default $0.03) charged for every checked card
-- Idempotent: safe to run multiple times.
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/bonus-and-check-fee.sql
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bonus_balance numeric NOT NULL DEFAULT 0;

INSERT INTO public.site_settings (key, value) VALUES ('check_fee', '0.03')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.card_checks
  ADD COLUMN IF NOT EXISTS fee numeric NOT NULL DEFAULT 0;

-- ---------- referral bonus goes to bonus_balance ----------
CREATE OR REPLACE FUNCTION public.award_referral_bonus(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _referrer uuid;
  _bonus numeric;
BEGIN
  SELECT referred_by INTO _referrer FROM public.profiles WHERE id = _user_id;
  IF _referrer IS NULL OR _referrer = _user_id THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = _user_id) THEN RETURN false; END IF;

  SELECT COALESCE(NULLIF(value,'')::numeric, 5) INTO _bonus FROM public.site_settings WHERE key = 'referral_bonus';
  _bonus := COALESCE(_bonus, 5);
  IF _bonus <= 0 THEN RETURN false; END IF;

  INSERT INTO public.referrals (referrer_id, referee_id, bonus_amount)
  VALUES (_referrer, _user_id, _bonus)
  ON CONFLICT (referee_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.profiles SET bonus_balance = bonus_balance + _bonus WHERE id IN (_referrer, _user_id);

  INSERT INTO public.balance_transactions (user_id, amount, kind, description)
  VALUES (_referrer, _bonus, 'referral', 'Referral bonus (bonus balance)'),
         (_user_id, _bonus, 'referral', 'Referral welcome bonus (bonus balance)');

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.award_referral_bonus(uuid) FROM PUBLIC, anon, authenticated;

-- ---------- purchase: bonus balance first, then main balance, plus check fee ----------
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
  _fee numeric := 0;
  _fee_each numeric := 0;
  _grand numeric;
  _from_bonus numeric;
  _order_id uuid;
  _content text;
  _key RECORD;
  _i integer;
  _rate numeric;
  _refund numeric := 0;
  _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _quantity < 1 OR _quantity > 50 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  SELECT * INTO _p FROM products WHERE id = _product_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_unavailable'; END IF;

  _total := _p.price * _quantity;

  IF COALESCE(_p.refundable, false) THEN
    SELECT COALESCE(NULLIF(value, '')::numeric, 0.03) INTO _fee_each
      FROM site_settings WHERE key = 'check_fee';
    _fee_each := GREATEST(COALESCE(_fee_each, 0.03), 0);
    _fee := _fee_each * _quantity;
  END IF;

  _grand := _total + _fee;

  SELECT balance, bonus_balance INTO _bal, _bonus_bal FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) + COALESCE(_bonus_bal,0) < _grand THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  INSERT INTO orders (user_id, total, status) VALUES (_uid, _grand, 'completed') RETURNING id INTO _order_id;

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

  -- spend bonus balance first, then the main balance
  _from_bonus := LEAST(COALESCE(_bonus_bal, 0), _grand);
  UPDATE profiles
     SET bonus_balance = bonus_balance - _from_bonus,
         balance = balance - (_grand - _from_bonus)
   WHERE id = _uid;

  UPDATE products SET sold_count = sold_count + _quantity WHERE id = _p.id;

  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_total, 'purchase', _p.title);

  IF _fee > 0 THEN
    INSERT INTO balance_transactions (user_id, amount, kind, description)
    VALUES (_uid, -_fee, 'check_fee', 'Check fee ' || _quantity || ' x $' || _fee_each);
  END IF;

  -- ---- checker: only refundable cards get checked ----
  IF COALESCE(_p.refundable, false) THEN
    SELECT COALESCE(NULLIF(value, '')::numeric, 60) INTO _rate
      FROM site_settings WHERE key = 'refund_live_rate';
    _rate := LEAST(GREATEST(COALESCE(_rate, 60), 0), 100);

    FOR _i IN 1.._quantity LOOP
      IF random() * 100 < _rate THEN _status := 'live'; ELSE _status := 'dead'; END IF;

      INSERT INTO card_checks (user_id, order_id, product_id, bin, last_digits, price, status, refunded, fee)
      VALUES (
        _uid, _order_id, _p.id, _p.bin,
        NULLIF(to_jsonb(_p) ->> 'last_digits', ''),
        _p.price, _status,
        CASE WHEN _status = 'dead' THEN _p.price ELSE 0 END,
        _fee_each
      );

      IF _status = 'dead' THEN _refund := _refund + _p.price; END IF;
    END LOOP;

    IF _refund > 0 THEN
      UPDATE profiles SET balance = balance + _refund WHERE id = _uid;
      INSERT INTO balance_transactions (user_id, amount, kind, description)
      VALUES (_uid, _refund, 'refund', 'Auto refund — dead card(s): ' || _p.title);
    END IF;
  END IF;

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_product(uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.purchase_product(uuid, integer) TO authenticated;

-- ---------- admin can adjust the bonus balance too ----------
CREATE OR REPLACE FUNCTION public.admin_adjust_bonus(_user_id uuid, _amount numeric, _description text DEFAULT 'Admin bonus adjustment')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET bonus_balance = GREATEST(bonus_balance + _amount, 0) WHERE id = _user_id;
  INSERT INTO public.balance_transactions (user_id, amount, kind, description)
  VALUES (_user_id, _amount, 'bonus_admin', _description);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_bonus(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_bonus(uuid, numeric, text) TO authenticated;
