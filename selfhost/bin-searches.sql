-- Zoru Shop — Public BIN Search Demand Tracker
-- Stores searches made by customers in the shop / bins page so admin can see which BINs are in highest demand.

CREATE TABLE IF NOT EXISTS public.bin_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bin varchar(12) NOT NULL,
  search_count integer NOT NULL DEFAULT 1,
  country varchar(10),
  brand varchar(50),
  bank varchar(150),
  card_type varchar(50),
  card_level varchar(50),
  last_searched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bin_searches_bin_unique UNIQUE (bin)
);

CREATE INDEX IF NOT EXISTS idx_bin_searches_count ON public.bin_searches (search_count DESC);
CREATE INDEX IF NOT EXISTS idx_bin_searches_last ON public.bin_searches (last_searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_bin_searches_bin ON public.bin_searches (bin);

-- Permissions
ALTER TABLE public.bin_searches ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.bin_searches TO service_role;
GRANT SELECT ON public.bin_searches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bin_searches TO anon;

DROP POLICY IF EXISTS public_access_bin_searches ON public.bin_searches;
CREATE POLICY public_access_bin_searches ON public.bin_searches
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
