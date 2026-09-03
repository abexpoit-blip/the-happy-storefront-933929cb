-- allow pending checks
ALTER TABLE public.card_checks DROP CONSTRAINT IF EXISTS card_checks_status_check;
ALTER TABLE public.card_checks ADD CONSTRAINT card_checks_status_check CHECK (status IN ('live','dead','pending'));

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
  _left integer;
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

  -- pending checks only: buyer starts the checker manually
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

-- manual checker
CREATE OR REPLACE FUNCTION public.run_card_checks(_order_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rate numeric;
  _seen integer;
  _c RECORD;
  _status text;
  _refund numeric := 0;
  _n integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT COALESCE(NULLIF(value, '')::numeric, 60) INTO _rate FROM site_settings WHERE key = 'refund_live_rate';
  _rate := LEAST(GREATEST(COALESCE(_rate, 60), 0), 100);

  SELECT count(*) INTO _seen FROM card_checks WHERE user_id = _uid AND status <> 'pending';

  FOR _c IN
    SELECT * FROM card_checks
     WHERE user_id = _uid AND status = 'pending'
       AND (_order_ids IS NULL OR order_id = ANY(_order_ids))
     ORDER BY created_at
     FOR UPDATE
  LOOP
    IF floor(((_seen + 1) * _rate) / 100.0) > floor((_seen * _rate) / 100.0) THEN
      _status := 'live';
    ELSE
      _status := 'dead';
    END IF;
    _seen := _seen + 1;
    _n := _n + 1;

    UPDATE card_checks
       SET status = _status,
           refunded = CASE WHEN _status = 'dead' THEN _c.price ELSE 0 END
     WHERE id = _c.id;

    IF _status = 'dead' THEN _refund := _refund + _c.price; END IF;
  END LOOP;

  IF _refund > 0 THEN
    UPDATE profiles SET balance = balance + _refund WHERE id = _uid;
    INSERT INTO balance_transactions (user_id, amount, kind, description)
    VALUES (_uid, _refund, 'refund', 'Refund — dead card(s) after manual check');
  END IF;

  RETURN _n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_card_checks(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.run_card_checks(uuid[]) TO authenticated;