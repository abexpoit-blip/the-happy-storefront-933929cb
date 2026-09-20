-- ============================================
-- Fix Unknown Brands & Base Names (Non-Destructive)
-- ============================================

-- 1. Fix Brands based on standard BIN ranges
UPDATE public.products 
SET brand = 'VISA' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD' OR brand = 'UNKNOWN') AND bin LIKE '4%';

UPDATE public.products 
SET brand = 'MASTERCARD' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD' OR brand = 'UNKNOWN') AND (bin LIKE '5%' OR bin LIKE '2%');

UPDATE public.products 
SET brand = 'AMEX' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD' OR brand = 'UNKNOWN') AND (bin LIKE '34%' OR bin LIKE '37%');

UPDATE public.products 
SET brand = 'DISCOVER' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD' OR brand = 'UNKNOWN') AND (bin LIKE '6011%' OR bin LIKE '65%' OR bin LIKE '64%');

UPDATE public.products 
SET brand = 'JCB' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD' OR brand = 'UNKNOWN') AND bin LIKE '35%';

-- 2. Fix Base names so cards uploaded in batches get their actual brand base
UPDATE public.products 
SET base = 'ADMIN_' || (regexp_match(base, '^ADMIN_([0-9_]+)_'))[1] || '_' || brand
WHERE base ~ '^ADMIN_[0-9_]+_' 
  AND brand IS NOT NULL 
  AND brand NOT IN ('OTHER', 'UNKNOWN', '', 'CARD')
  AND (regexp_match(base, '^ADMIN_[0-9_]+_(.*)$'))[1] != brand;

-- 3. Definite Brand Issuers (100% accurate)
UPDATE public.products SET bank = 'AMERICAN EXPRESS'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%')
  AND (bin LIKE '34%' OR bin LIKE '37%' OR brand = 'AMEX');

UPDATE public.products SET bank = 'DISCOVER FINANCIAL SERVICES'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%')
  AND (bin LIKE '6011%' OR bin LIKE '65%' OR brand = 'DISCOVER');
