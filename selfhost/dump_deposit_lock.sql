-- 1. Helper function to check if current user has made at least 1 deposit
CREATE OR REPLACE FUNCTION public.has_deposited()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  IF has_role(_uid, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM deposits WHERE user_id = _uid AND status = 'approved'
  ) OR EXISTS (
    SELECT 1 FROM balance_transactions WHERE user_id = _uid AND (kind = 'deposit' OR (amount > 0 AND kind NOT IN ('refund', 'referral_bonus')))
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.has_deposited() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_deposited() TO anon;

-- 2. Update purchase_product to guard DUMP section:
--    - Requires at least 1 deposit (unless admin)
--    - Blocks duplicate purchase of the same dump file by the same user
--    - Limits quantity to 1 for dumps
CREATE OR REPLACE FUNCTION public.purchase_product(_product_id uuid, _quantity integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  -- Guard DUMP products:
  IF _p.section = 'dump' THEN
    IF _quantity > 1 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    -- Must have deposited at least once
    IF NOT has_role(_uid, 'admin'::app_role) THEN
      IF NOT (
        EXISTS (SELECT 1 FROM deposits WHERE user_id = _uid AND status = 'approved')
        OR EXISTS (SELECT 1 FROM balance_transactions WHERE user_id = _uid AND (kind = 'deposit' OR (amount > 0 AND kind NOT IN ('refund', 'referral_bonus'))))
      ) THEN
        RAISE EXCEPTION 'dump_deposit_required';
      END IF;
    END IF;

    -- Must not have already purchased this dump file
    IF EXISTS (
      SELECT 1 FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = _uid AND oi.product_id = _p.id
    ) THEN
      RAISE EXCEPTION 'dump_already_purchased';
    END IF;
  END IF;

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

  IF COALESCE(_p.refundable, false) THEN
    FOR _i IN 1.._quantity LOOP
      INSERT INTO card_checks (user_id, order_id, product_id, bin, last_digits, price, status, refunded, fee)
      VALUES (_uid, _order_id, _p.id, _p.bin,
              NULLIF(to_jsonb(_p) ->> 'last_digits', ''),
              _p.price, 'pending', 0, _fee_each);
    END LOOP;
  END IF;

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
$function$;
