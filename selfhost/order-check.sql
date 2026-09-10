-- ============================================================
-- Order-page checking.
--   * The $0.03 check fee is NO LONGER charged at purchase.
--   * The buyer pays it only when they press CHECK on the order page.
--   * DEAD cards refund the card price (settle_card_check, unchanged).
-- Idempotent:
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/order-check.sql
-- ============================================================

INSERT INTO public.site_settings (key, value)
VALUES ('check_fee', '0.03')
ON CONFLICT (key) DO NOTHING;

-- ── purchase without the check fee ──────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_product(_product_id uuid, _quantity integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _quantity < 1 OR _quantity > 50 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  SELECT * INTO _p FROM products WHERE id = _product_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_unavailable'; END IF;

  _total := _p.price * _quantity;

  SELECT balance, bonus_balance INTO _bal, _bonus_bal FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) + COALESCE(_bonus_bal,0) < _total THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

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
         balance = balance - (_total - _from_bonus)
   WHERE id = _uid;

  UPDATE products SET sold_count = sold_count + _quantity WHERE id = _p.id;

  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_total, 'purchase', _p.title);

  -- refundable cards get a pending check row; the fee is charged later, on demand
  IF COALESCE(_p.refundable, false) THEN
    FOR _i IN 1.._quantity LOOP
      INSERT INTO card_checks (user_id, order_id, product_id, bin, last_digits, price, status, refunded, fee)
      VALUES (_uid, _order_id, _p.id, _p.bin,
              NULLIF(to_jsonb(_p) ->> 'last_digits', ''),
              _p.price, 'pending', 0, 0);
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
$function$;

-- ── pay for one check, on demand ────────────────────────────
CREATE OR REPLACE FUNCTION public.charge_order_check(_check_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _c RECORD;
  _fee numeric;
  _bal numeric;
  _bonus numeric;
  _from_bonus numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _c FROM card_checks WHERE id = _check_id AND user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'check_not_found'; END IF;
  IF _c.status <> 'pending' THEN RAISE EXCEPTION 'already_checked'; END IF;
  IF COALESCE(_c.fee, 0) > 0 THEN RETURN _c.fee; END IF;  -- already paid, resuming

  SELECT COALESCE(NULLIF(value,'')::numeric, 0.03) INTO _fee FROM site_settings WHERE key = 'check_fee';
  _fee := GREATEST(COALESCE(_fee, 0.03), 0);

  SELECT balance, bonus_balance INTO _bal, _bonus FROM profiles WHERE id = _uid FOR UPDATE;
  IF COALESCE(_bal,0) + COALESCE(_bonus,0) < _fee THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  _from_bonus := LEAST(COALESCE(_bonus,0), _fee);
  UPDATE profiles
     SET bonus_balance = bonus_balance - _from_bonus,
         balance = balance - (_fee - _from_bonus)
   WHERE id = _uid;

  UPDATE card_checks SET fee = _fee WHERE id = _c.id;

  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_fee, 'check_fee', 'Card check fee');

  RETURN _fee;
END;
$$;

GRANT EXECUTE ON FUNCTION public.charge_order_check(uuid) TO authenticated;

-- ── give the fee back when the gateway never answered ───────
CREATE OR REPLACE FUNCTION public.refund_order_check(_check_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _c RECORD;
BEGIN
  SELECT * INTO _c FROM card_checks WHERE id = _check_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF COALESCE(_c.fee, 0) <= 0 THEN RETURN 0; END IF;

  UPDATE profiles SET balance = balance + _c.fee WHERE id = _c.user_id;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_c.user_id, _c.fee, 'check_fee_refund', 'Check fee refunded — card was not checked');
  UPDATE card_checks SET fee = 0 WHERE id = _c.id;

  RETURN _c.fee;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_order_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_order_check(uuid) TO service_role;
