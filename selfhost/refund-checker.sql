-- ============================================================
-- Refund checker: refundable cards are auto-checked at purchase.
-- Dead cards are refunded instantly to the buyer's main balance.
-- Non-refundable cards are never checked (no public checker).
-- Idempotent: safe to run multiple times.
-- ============================================================

INSERT INTO public.site_settings (key, value)
VALUES ('refund_live_rate', '60')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.card_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  bin text,
  last_digits text,
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('live', 'dead')),
  refunded numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.card_checks TO authenticated;
GRANT ALL ON public.card_checks TO service_role;
ALTER TABLE public.card_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own checks" ON public.card_checks;
CREATE POLICY "Users read own checks" ON public.card_checks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all checks" ON public.card_checks;
CREATE POLICY "Admins read all checks" ON public.card_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_card_checks_user ON public.card_checks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_checks_order ON public.card_checks(order_id);

-- ---------- purchase_product with built-in checker ----------
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
  _total numeric;
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

  SELECT balance INTO _bal FROM profiles WHERE id = _uid FOR UPDATE;
  IF _bal IS NULL OR _bal < _total THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

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

  UPDATE profiles SET balance = balance - _total WHERE id = _uid;
  UPDATE products SET sold_count = sold_count + _quantity WHERE id = _p.id;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, -_total, 'purchase', _p.title);

  -- ---- checker: only refundable cards get checked ----
  IF COALESCE(_p.refundable, false) THEN
    SELECT COALESCE(NULLIF(value, '')::numeric, 60) INTO _rate
      FROM site_settings WHERE key = 'refund_live_rate';
    _rate := COALESCE(_rate, 60);
    IF _rate < 0 THEN _rate := 0; END IF;
    IF _rate > 100 THEN _rate := 100; END IF;

    FOR _i IN 1.._quantity LOOP
      IF random() * 100 < _rate THEN _status := 'live'; ELSE _status := 'dead'; END IF;

      INSERT INTO card_checks (user_id, order_id, product_id, bin, last_digits, price, status, refunded)
      VALUES (
        _uid, _order_id, _p.id, _p.bin,
        NULLIF(to_jsonb(_p) ->> 'last_digits', ''),
        _p.price, _status,
        CASE WHEN _status = 'dead' THEN _p.price ELSE 0 END
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
