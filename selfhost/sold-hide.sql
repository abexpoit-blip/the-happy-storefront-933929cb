-- ============================================================
-- A sold card must disappear from the shop, always.
--   * stock sync now also deactivates a product with no unsold keys
--   * one-off cleanup for cards that are already sold but still listed
-- Idempotent:
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/sold-hide.sql
-- ============================================================

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
  SELECT count(*) INTO _left FROM product_keys k WHERE k.product_id = _pid AND k.is_sold = false;
  UPDATE products p
     SET stock = COALESCE(_left, 0),
         active = CASE WHEN COALESCE(_left, 0) <= 0 THEN false ELSE p.active END
   WHERE p.id = _pid;
  RETURN NULL;
END;
$function$;

-- clean up anything already sold but still visible
UPDATE public.products p
   SET active = false, stock = 0
 WHERE p.active = true
   AND p.delivery_type = 'key'
   AND NOT EXISTS (
     SELECT 1 FROM public.product_keys k
      WHERE k.product_id = p.id AND k.is_sold = false
   );
