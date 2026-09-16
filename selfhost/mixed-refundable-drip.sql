-- ZORU CC: Card Metadata & Mixed Refundability Enhancements
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS card_type TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS card_level TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bank TEXT;
CREATE INDEX IF NOT EXISTS idx_products_card_level ON public.products(card_level);
CREATE INDEX IF NOT EXISTS idx_products_bank ON public.products(bank);
CREATE INDEX IF NOT EXISTS idx_products_refundable ON public.products(refundable);
