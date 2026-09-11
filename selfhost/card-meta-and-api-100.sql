-- Card metadata (TYPE / LEVEL / BANK) shown in the shop + API access fee = $100.
-- Idempotent: safe to run again.
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/card-meta-and-api-100.sql

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS card_type  text;  -- CREDIT / DEBIT / PREPAID
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS card_level text;  -- CLASSIC / GOLD / PLATINUM ...
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bank       text;  -- issuing bank name

CREATE INDEX IF NOT EXISTS products_card_type_idx ON public.products (card_type);

-- API access fee is $100 (older installs still had 50)
INSERT INTO public.site_settings (key, value)
VALUES ('api_access_fee', '100')
ON CONFLICT (key) DO UPDATE SET value = '100', updated_at = now();
