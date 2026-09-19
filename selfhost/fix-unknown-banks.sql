-- ============================================
-- Fix Unknown Banks, Brand Mismatches & Base Names
-- ============================================

-- 1. Fix Brands based on standard BIN ranges
UPDATE public.products 
SET brand = 'VISA' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND bin LIKE '4%';

UPDATE public.products 
SET brand = 'MASTERCARD' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND (bin LIKE '5%' OR bin LIKE '2%');

UPDATE public.products 
SET brand = 'AMEX' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND (bin LIKE '34%' OR bin LIKE '37%');

UPDATE public.products 
SET brand = 'DISCOVER' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND (bin LIKE '6011%' OR bin LIKE '65%' OR bin LIKE '64%');

UPDATE public.products 
SET brand = 'JCB' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND bin LIKE '35%';

-- 2. Fix Base names so non-Visa cards uploaded in Visa batches get their actual brand base
-- e.g. ADMIN_2026_09_19_VISA -> ADMIN_2026_09_19_MASTERCARD if brand is MASTERCARD
UPDATE public.products 
SET base = 'ADMIN_' || (regexp_match(base, '^ADMIN_([0-9_]+)_'))[1] || '_' || brand
WHERE base ~ '^ADMIN_[0-9_]+_' 
  AND brand IS NOT NULL 
  AND brand NOT IN ('OTHER', 'UNKNOWN', '', 'CARD')
  AND (regexp_match(base, '^ADMIN_[0-9_]+_(.*)$'))[1] != brand;

-- 3. Fix Bank names: resolve real bank names from BIN prefixes instead of 'UNKNOWN BANK'
UPDATE public.products SET bank = 'JPMORGAN CHASE BANK, N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4147%' OR bin LIKE '4246%' OR bin LIKE '4388%' OR bin LIKE '4400%' OR 
  bin LIKE '4737%' OR bin LIKE '4465%' OR bin LIKE '4111%' OR bin LIKE '5466%' OR bin LIKE '5262%'
);

UPDATE public.products SET bank = 'BANK OF AMERICA, N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4800%' OR bin LIKE '4802%' OR bin LIKE '4854%' OR bin LIKE '4356%' OR 
  bin LIKE '5424%' OR bin LIKE '5524%' OR bin LIKE '5243%'
);

UPDATE public.products SET bank = 'WELLS FARGO BANK, N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4716%' OR bin LIKE '4097%' OR bin LIKE '4342%' OR bin LIKE '5434%' OR 
  bin LIKE '5275%' OR bin LIKE '4717%'
);

UPDATE public.products SET bank = 'CITIBANK, N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4128%' OR bin LIKE '4553%' OR bin LIKE '5424%' OR bin LIKE '5466%' OR bin LIKE '5467%'
);

UPDATE public.products SET bank = 'CAPITAL ONE BANK (USA), N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '5178%' OR bin LIKE '5291%' OR bin LIKE '5338%' OR bin LIKE '5353%' OR 
  bin LIKE '5456%' OR bin LIKE '4288%' OR bin LIKE '5179%'
);

UPDATE public.products SET bank = 'U.S. BANK N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4000%' OR bin LIKE '4224%' OR bin LIKE '4225%' OR bin LIKE '4226%' OR 
  bin LIKE '4744%' OR bin LIKE '4851%' OR bin LIKE '5108%'
);

UPDATE public.products SET bank = 'PNC BANK, N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4389%' OR bin LIKE '5219%' OR bin LIKE '5180%' OR bin LIKE '5181%'
);

UPDATE public.products SET bank = 'TD BANK, N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4514%' OR bin LIKE '4724%' OR bin LIKE '4504%' OR bin LIKE '4520%'
);

UPDATE public.products SET bank = 'SYNCHRONY BANK'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4020%' OR bin LIKE '4021%' OR bin LIKE '4833%' OR bin LIKE '6032%'
);

UPDATE public.products SET bank = 'NAVY FEDERAL CREDIT UNION'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4566%' OR bin LIKE '4985%' OR bin LIKE '4567%'
);

UPDATE public.products SET bank = 'USAA FEDERAL SAVINGS BANK'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4310%' OR bin LIKE '4447%' OR bin LIKE '4503%' OR bin LIKE '5117%'
);

UPDATE public.products SET bank = 'BARCLAYS BANK PLC'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4929%' OR bin LIKE '4543%' OR bin LIKE '4921%'
);

UPDATE public.products SET bank = 'HSBC BANK PLC'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (
  bin LIKE '4001%' OR bin LIKE '4546%' OR bin LIKE '5168%'
);

UPDATE public.products SET bank = 'SANTANDER BANK, N.A.'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND bin LIKE '4544%';

UPDATE public.products SET bank = 'ROYAL BANK OF CANADA'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (bin LIKE '4510%' OR bin LIKE '4511%');

UPDATE public.products SET bank = 'AMERICAN EXPRESS'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (bin LIKE '34%' OR bin LIKE '37%' OR brand = 'AMEX');

UPDATE public.products SET bank = 'DISCOVER FINANCIAL SERVICES'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND (bin LIKE '6011%' OR bin LIKE '65%' OR brand = 'DISCOVER');

UPDATE public.products SET bank = 'VISA ISSUING BANK'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND brand = 'VISA';

UPDATE public.products SET bank = 'MASTERCARD ISSUING BANK'
WHERE (bank IS NULL OR bank ILIKE '%UNKNOWN%') AND brand = 'MASTERCARD';
