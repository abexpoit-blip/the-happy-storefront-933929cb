-- BIN + DUMP sections (idempotent).
-- section: 'card' (default shop card), 'bin' (BIN sale), 'dump' (bulk file / remaining-expiring cards)

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'card';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS card_type text;      -- CREDIT / DEBIT / PREPAID
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS card_level text;     -- Platinum / Gold / Business ...
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bin_category text;   -- e.g. "SHOPIFY 500/1000$ order"
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS file_name text;      -- dump file name
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS file_lines integer NOT NULL DEFAULT 0; -- cards inside the dump
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expires_on date;     -- dump validity / expiry date

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_section_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_section_check CHECK (section IN ('card','bin','dump'));
  END IF;
END $$;

UPDATE public.products SET section = 'card' WHERE section IS NULL;

CREATE INDEX IF NOT EXISTS products_section_active_idx ON public.products (section, active, created_at DESC);
