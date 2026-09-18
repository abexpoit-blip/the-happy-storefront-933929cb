-- Fix announcements check constraint to allow 'update', 'alert', 'maintenance'
ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_kind_check;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_kind_check 
  CHECK (kind IN ('info','warning','promo','success','update','alert','maintenance'));

-- Seed 6 months of historical base updates if not already present
-- (From March 2026 to September 2026)
INSERT INTO public.announcements (title, body, kind, created_at, sort_order)
SELECT t.title, t.body, 'update', t.created_at, 0
FROM (VALUES
  ('Base Update: 2026_09_18_VISA', 'Fresh batch of verified US/EU VISA cards added. Available in shop now.', '2026-09-18 04:00:00+00'::timestamptz),
  ('Base Update: 2026_09_15_MASTERCARD', 'Fresh batch of verified Mastercard cards added. Available in shop now.', '2026-09-15 04:00:00+00'::timestamptz),
  ('Base Update: 2026_09_11_AMEX', 'Fresh batch of verified AMEX cards added. Available in shop now.', '2026-09-11 04:00:00+00'::timestamptz),
  ('Base Update: 2026_09_06_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-09-06 04:00:00+00'::timestamptz),
  ('Base Update: 2026_08_31_DISCOVER', 'Fresh batch of verified Discover cards added. Available in shop now.', '2026-08-31 04:00:00+00'::timestamptz),
  ('Base Update: 2026_08_25_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-08-25 04:00:00+00'::timestamptz),
  ('Base Update: 2026_08_19_MASTERCARD', 'Fresh batch of verified Mastercard cards added. Available in shop now.', '2026-08-19 04:00:00+00'::timestamptz),
  ('Base Update: 2026_08_13_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-08-13 04:00:00+00'::timestamptz),
  ('Base Update: 2026_08_07_AMEX', 'Fresh batch of verified AMEX cards added. Available in shop now.', '2026-08-07 04:00:00+00'::timestamptz),
  ('Base Update: 2026_08_01_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-08-01 04:00:00+00'::timestamptz),
  ('Base Update: 2026_07_26_MASTERCARD', 'Fresh batch of verified Mastercard cards added. Available in shop now.', '2026-07-26 04:00:00+00'::timestamptz),
  ('Base Update: 2026_07_20_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-07-20 04:00:00+00'::timestamptz),
  ('Base Update: 2026_07_14_DISCOVER', 'Fresh batch of verified Discover cards added. Available in shop now.', '2026-07-14 04:00:00+00'::timestamptz),
  ('Base Update: 2026_07_07_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-07-07 04:00:00+00'::timestamptz),
  ('Base Update: 2026_06_30_MASTERCARD', 'Fresh batch of verified Mastercard cards added. Available in shop now.', '2026-06-30 04:00:00+00'::timestamptz),
  ('Base Update: 2026_06_23_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-06-23 04:00:00+00'::timestamptz),
  ('Base Update: 2026_06_16_AMEX', 'Fresh batch of verified AMEX cards added. Available in shop now.', '2026-06-16 04:00:00+00'::timestamptz),
  ('Base Update: 2026_06_09_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-06-09 04:00:00+00'::timestamptz),
  ('Base Update: 2026_06_02_DISCOVER', 'Fresh batch of verified Discover cards added. Available in shop now.', '2026-06-02 04:00:00+00'::timestamptz),
  ('Base Update: 2026_05_26_MASTERCARD', 'Fresh batch of verified Mastercard cards added. Available in shop now.', '2026-05-26 04:00:00+00'::timestamptz),
  ('Base Update: 2026_05_19_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-05-19 04:00:00+00'::timestamptz),
  ('Base Update: 2026_05_12_AMEX', 'Fresh batch of verified AMEX cards added. Available in shop now.', '2026-05-12 04:00:00+00'::timestamptz),
  ('Base Update: 2026_05_05_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-05-05 04:00:00+00'::timestamptz),
  ('Base Update: 2026_04_28_MASTERCARD', 'Fresh batch of verified Mastercard cards added. Available in shop now.', '2026-04-28 04:00:00+00'::timestamptz),
  ('Base Update: 2026_04_21_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-04-21 04:00:00+00'::timestamptz),
  ('Base Update: 2026_04_14_DISCOVER', 'Fresh batch of verified Discover cards added. Available in shop now.', '2026-04-14 04:00:00+00'::timestamptz),
  ('Base Update: 2026_04_07_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-04-07 04:00:00+00'::timestamptz),
  ('Base Update: 2026_03_31_MASTERCARD', 'Fresh batch of verified Mastercard cards added. Available in shop now.', '2026-03-31 04:00:00+00'::timestamptz),
  ('Base Update: 2026_03_24_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-03-24 04:00:00+00'::timestamptz),
  ('Base Update: 2026_03_18_AMEX', 'Fresh batch of verified AMEX cards added. Available in shop now.', '2026-03-18 04:00:00+00'::timestamptz),
  ('Base Update: 2026_03_12_VISA', 'Fresh batch of verified VISA cards added. Available in shop now.', '2026-03-12 04:00:00+00'::timestamptz)
) AS t(title, body, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM public.announcements WHERE title = t.title
);
