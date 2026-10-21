CREATE OR REPLACE FUNCTION public.set_product_key_pan()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
  _sec text;
BEGIN
  SELECT section INTO _sec FROM products WHERE id = NEW.product_id;
  IF _sec = 'dump' THEN
    NEW.pan := NULL;
    RETURN NEW;
  END IF;

  IF (NEW.pan IS NULL OR NEW.pan = '') AND NEW.content IS NOT NULL THEN
    NEW.pan := substring(NEW.content from '([0-9]{12,19})');
  END IF;
  RETURN NEW;
END;
$func$;
