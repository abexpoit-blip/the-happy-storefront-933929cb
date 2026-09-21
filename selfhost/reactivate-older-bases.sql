-- ============================================================
-- Reactivate Older Bases & Repair Stock Synchronization
--
-- Why:
-- 1. Older cards in previous bases may have been accidentally set
--    to active=false when bulk cleanups ran, or when stock was initialized to 0.
-- 2. sync_product_stock trigger only deactivated (active = CASE WHEN _left <= 0 THEN false ELSE p.active END),
--    which never turned products back to active=true when keys were present.
--
-- Usage:
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/reactivate-older-bases.sql
-- ============================================================

-- 1. Correct the stock sync trigger function so unsold keys reactivate the product
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _pid uuid;
  _left integer;
BEGIN
  _pid := COALESCE(NEW.product_id, OLD.product_id);
  IF _pid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO _left
    FROM public.product_keys k
   WHERE k.product_id = _pid AND k.is_sold = false;

  UPDATE public.products p
     SET stock = COALESCE(_left, 0),
         active = CASE WHEN COALESCE(_left, 0) <= 0 THEN false ELSE true END
   WHERE p.id = _pid;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_keys_stock ON public.product_keys;
CREATE TRIGGER trg_keys_stock
AFTER INSERT OR UPDATE OR DELETE ON public.product_keys
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();

-- 2. Create RPC function callable from Admin panel
CREATE OR REPLACE FUNCTION public.reactivate_unsold_products()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _count integer;
BEGIN
  -- Reactivate and update stock for all products with unsold keys
  WITH updated AS (
    UPDATE public.products p
       SET active = true,
           stock = sub.unsold_count
      FROM (
        SELECT product_id, count(*) AS unsold_count
          FROM public.product_keys
         WHERE is_sold = false
         GROUP BY product_id
      ) sub
     WHERE p.id = sub.product_id
       AND (p.active = false OR p.stock != sub.unsold_count)
     RETURNING p.id
  )
  SELECT count(*) INTO _count FROM updated;

  -- Also make sure products with 0 unsold keys are marked inactive and stock 0
  UPDATE public.products p
     SET active = false, stock = 0
   WHERE p.delivery_type = 'key'
     AND p.active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.product_keys k
        WHERE k.product_id = p.id AND k.is_sold = false
     );

  RETURN COALESCE(_count, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reactivate_unsold_products() TO anon, authenticated, service_role;

-- 3. One-off reactivation run immediately:
-- Revive all products that have unsold cards
UPDATE public.products p
   SET active = true,
       stock = (SELECT count(*) FROM public.product_keys k WHERE k.product_id = p.id AND k.is_sold = false)
 WHERE p.delivery_type = 'key'
   AND EXISTS (
     SELECT 1 FROM public.product_keys k
      WHERE k.product_id = p.id AND k.is_sold = false
   );

-- Ensure indexes for fast base filtering
CREATE INDEX IF NOT EXISTS idx_products_base_active ON public.products (base, active);
CREATE INDEX IF NOT EXISTS idx_products_active_stock ON public.products (active, stock) WHERE active = true;
