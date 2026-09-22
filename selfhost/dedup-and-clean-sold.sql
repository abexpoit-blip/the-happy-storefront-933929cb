-- ============================================================
-- Deduplicate cards, prevent double uploads, and hide sold items
-- Idempotent & Highly Optimized Migration
-- ============================================================

-- 1. Ensure pan column exists on product_keys
ALTER TABLE public.product_keys ADD COLUMN IF NOT EXISTS pan text;
CREATE INDEX IF NOT EXISTS idx_product_keys_pan ON public.product_keys (pan);

-- 2. Fast populate pan on existing product_keys from content
UPDATE public.product_keys
   SET pan = substring(content from '([0-9]{12,19})')
 WHERE (pan IS NULL OR pan = '')
   AND content ~ '[0-9]{12,19}';

-- 3. Trigger to always set pan before insert or update
CREATE OR REPLACE FUNCTION public.set_product_key_pan()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.pan IS NULL OR NEW.pan = '') AND NEW.content IS NOT NULL THEN
    NEW.pan := substring(NEW.content from '([0-9]{12,19})');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_product_key_pan ON public.product_keys;
CREATE TRIGGER trg_set_product_key_pan
BEFORE INSERT OR UPDATE ON public.product_keys
FOR EACH ROW EXECUTE FUNCTION public.set_product_key_pan();

-- 4. Fast deduplicate keys in product_keys using window function
WITH ranked_keys AS (
  SELECT id, is_sold,
         ROW_NUMBER() OVER (
           PARTITION BY pan
           ORDER BY is_sold DESC, created_at ASC, id ASC
         ) as rn
    FROM public.product_keys
   WHERE pan IS NOT NULL AND pan <> ''
)
DELETE FROM public.product_keys
 WHERE id IN (
   SELECT id FROM ranked_keys WHERE rn > 1 AND is_sold = false
 );

-- Clean up duplicate products whose keys were deleted
DELETE FROM public.products p
 WHERE p.delivery_type = 'key'
   AND NOT EXISTS (
     SELECT 1 FROM public.product_keys k WHERE k.product_id = p.id
   );

-- 5. Safe Unique index on product_keys(pan)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_keys_pan_unique'
  ) THEN
    WITH dup_sold AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY pan ORDER BY sold_at DESC, created_at ASC) as rn
        FROM public.product_keys
       WHERE pan IS NOT NULL AND pan <> ''
    )
    DELETE FROM public.product_keys WHERE id IN (SELECT id FROM dup_sold WHERE rn > 1);

    CREATE UNIQUE INDEX idx_product_keys_pan_unique 
      ON public.product_keys (pan) 
      WHERE pan IS NOT NULL AND pan <> '';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Notice: idx_product_keys_pan_unique already exists or skipped';
END $$;

-- 6. Fast clean up duplicate pending items in card_drip_items
WITH dup_drip AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY cc ORDER BY created_at ASC, id ASC) as rn
    FROM public.card_drip_items
   WHERE status = 'pending'
)
DELETE FROM public.card_drip_items WHERE id IN (SELECT id FROM dup_drip WHERE rn > 1);

-- Also remove pending drip items that already exist in product_keys (using indexed IN lookup)
DELETE FROM public.card_drip_items a
 WHERE a.status = 'pending'
   AND a.cc IN (SELECT pan FROM public.product_keys WHERE pan IS NOT NULL);

-- 7. Fix sync_product_stock function and trigger
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _left integer;
BEGIN
  _pid := COALESCE(NEW.product_id, OLD.product_id);
  IF _pid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO _left FROM product_keys k WHERE k.product_id = _pid AND k.is_sold = false;
  UPDATE products p
     SET stock = COALESCE(_left, 0),
         active = CASE WHEN COALESCE(_left, 0) <= 0 THEN false ELSE true END
   WHERE p.id = _pid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_keys_stock ON public.product_keys;
CREATE TRIGGER trg_keys_stock
AFTER INSERT OR UPDATE OR DELETE ON public.product_keys
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();

-- 8. Correctly sync products with their actual product_keys stock
-- Reactivate any product that has unsold keys!
UPDATE public.products p
   SET active = true,
       stock = (SELECT count(*) FROM public.product_keys k WHERE k.product_id = p.id AND k.is_sold = false)
 WHERE p.delivery_type = 'key'
   AND EXISTS (
     SELECT 1 FROM public.product_keys k WHERE k.product_id = p.id AND k.is_sold = false
   );

-- Only deactivate products that have ZERO unsold keys left
UPDATE public.products p
   SET active = false, stock = 0
 WHERE p.delivery_type = 'key'
   AND NOT EXISTS (
     SELECT 1 FROM public.product_keys k WHERE k.product_id = p.id AND k.is_sold = false
   );

-- 9. Update bot subscribers registry
CREATE TABLE IF NOT EXISTS public.update_bot_subscribers (
  telegram_id bigint PRIMARY KEY,
  username text,
  first_name text,
  subscribed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.update_bot_subscribers TO service_role;
