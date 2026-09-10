-- ============================================================
-- One order for a whole cart purchase.
--   * All selected cards land in ONE order (order_items per card).
--   * Refundable cards still get a pending card_checks row (fee on demand).
-- Idempotent:
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/cart-order.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.purchase_cart(_product_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _pid uuid;
  _p RECORD;
  _bal numeric;
  _bonus_bal numeric;
  _total numeric := 0;
  _from_bonus numeric;
  _order_id uuid;
  _content text;
  _key RECORD;
  _left integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _product_ids IS NULL OR array_length(_product_ids, 1) IS NULL THEN RAISE EXCEPTION 'empty_cart'; END IF;
  IF array_length(_product_ids, 1) > 200 THEN RAISE EXCEPTION 'too_many_items'; END IF;

  SELECT COALESCE(sum(price), 0) INTO _total
    FROM products WHERE id = ANY(_product_ids) AND active = true;

  SELECT balance, bonus_balance INTO _bal, _bonus_bal FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) + COALESCE(_bonus_bal,0) < _total THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  INSERT INTO orders (user_id, total, status) VALUES (_uid, 0, 'completed') RETURNING id INTO _order_id;
  _total := 0;

  FOREACH _pid IN ARRAY _product_ids LOOP
    SELECT * INTO _p FROM products WHERE id = _pid AND active = true FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_unavailable'; END IF;

    IF _p.delivery_type = 'key' THEN
      SELECT * INTO _key FROM product_keys
       WHERE product_id = _p.id AND is_sold = false
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
      IF NOT FOUND THEN RAISE EXCEPTION 'out_of_stock'; END IF;
      UPDATE product_keys SET is_sold = true, sold_to = _uid, sold_at = now() WHERE id = _key.id;
      _content := _key.content;
    ELSIF _p.delivery_type = 'download' THEN
      _content := _p.download_url;
    ELSE
      _content := _p.instant_content;
    END IF;

    INSERT INTO order_items (order_id, product_id, title, unit_price, quantity, delivered_content)
    VALUES (_order_id, _p.id, _p.title, _p.price, 1, _content);

    IF COALESCE(_p.refundable, false) THEN
      INSERT INTO card_checks (user_id, order_id, product_id, bin, last_digits, price, status, refunded, fee)
      VALUES (_uid, _order_id, _p.id, _p.bin,
              NULLIF(to_jsonb(_p) ->> 'last_digits', ''),
              _p.price, 'pending', 0, 0);
    END IF;

    UPDATE products SET sold_count = sold_count + 1 WHERE id = _p.id;

    IF _p.delivery_type = 'key' THEN
      SELECT count(*) INTO _left FROM product_keys WHERE product_id = _p.id AND is_sold = false;
      IF COALESCE(_left, 0) <= 0 THEN UPDATE products SET active = false WHERE id = _p.id; END IF;
    ELSE
      UPDATE products SET active = false WHERE id = _p.id;
    END IF;

    _total := _total + _p.price;
  END LOOP;

  UPDATE orders SET total = _total WHERE id = _order_id;

  _from_bonus := LEAST(COALESCE(_bonus_bal, 0), _total);
  UPDATE profiles
     SET bonus_balance = bonus_balance - _from_bonus,
         balance = balance - (_total - _from_bonus)
   WHERE id = _uid;

  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_total, 'purchase', 'Cart purchase (' || array_length(_product_ids, 1) || ' items)');

  RETURN _order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_cart(uuid[]) TO authenticated;
