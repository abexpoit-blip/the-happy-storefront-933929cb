-- Ensure deposits, bot account, website signup, and running-month clearance sync (idempotent)
-- Run on VPS:
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/deposit-bot-sync.sql

-- 1. Atomic settle_crypto_deposit with idempotency and referral bonus trigger
CREATE OR REPLACE FUNCTION public.settle_crypto_deposit(
  _invoice_id text,
  _status text,
  _confirmations integer DEFAULT 0,
  _txid text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _d RECORD;
BEGIN
  SELECT * INTO _d FROM deposits WHERE invoice_id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  UPDATE deposits
     SET confirmations = GREATEST(COALESCE(_confirmations,0), deposits.confirmations),
         txid = COALESCE(_txid, deposits.txid)
   WHERE id = _d.id;

  -- Idempotency check: Never add balance or insert transactions if already approved!
  IF _d.status = 'approved' THEN RETURN 'already_approved'; END IF;

  IF _status = 'approved' THEN
    UPDATE profiles SET balance = balance + _d.amount WHERE id = _d.user_id;
    INSERT INTO balance_transactions (user_id, amount, kind, description)
    VALUES (_d.user_id, _d.amount, 'deposit', 'Crypto deposit confirmed');
    UPDATE deposits SET status = 'approved' WHERE id = _d.id;

    -- Trigger referral bonus if referee qualifies
    BEGIN
      PERFORM public.award_referral_bonus(_d.user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN 'approved';
  ELSIF _status IN ('rejected','expired','cancelled') THEN
    UPDATE deposits SET status = 'rejected' WHERE id = _d.id;
    RETURN 'rejected';
  END IF;

  RETURN 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_crypto_deposit(text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_crypto_deposit(text, text, integer, text) TO service_role;

-- 2. Auto-heal any telegram_accounts missing their profile row
INSERT INTO public.profiles (id, username, email, referral_code, balance, bonus_balance)
SELECT
  ta.user_id,
  COALESCE('tg_' || NULLIF(ta.username, ''), 'tg_' || ta.telegram_id::text),
  'tg' || ta.telegram_id::text || '@bot.zoru.cc',
  upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  0,
  0
FROM public.telegram_accounts ta
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ta.user_id)
ON CONFLICT (id) DO NOTHING;

-- 3. Ensure user_roles has buyer for all users
INSERT INTO public.user_roles (user_id, role)
SELECT ta.user_id, 'buyer'::public.app_role
FROM public.telegram_accounts ta
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ta.user_id)
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. Auto-confirm all existing users in auth.users so website users are never locked out
UPDATE auth.users
   SET email_confirmed_at = COALESCE(email_confirmed_at, now())
 WHERE email_confirmed_at IS NULL;

-- 5. Auto-confirm trigger for future website signups
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.email_confirmed_at = COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
    CREATE TRIGGER on_auth_user_auto_confirm
      BEFORE INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_user();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. Running month clearance discount ($0.20) for cards expiring in the current month or past
UPDATE public.products
   SET price = 0.20
 WHERE active = true
   AND price > 0.20
   AND exp_year IS NOT NULL
   AND exp_month IS NOT NULL
   AND (
     (CASE WHEN exp_year ~ '^\d+$' AND exp_year::int < 100 THEN 2000 + exp_year::int WHEN exp_year ~ '^\d+$' THEN exp_year::int ELSE 9999 END) < EXTRACT(YEAR FROM now())
     OR (
       (CASE WHEN exp_year ~ '^\d+$' AND exp_year::int < 100 THEN 2000 + exp_year::int WHEN exp_year ~ '^\d+$' THEN exp_year::int ELSE 9999 END) = EXTRACT(YEAR FROM now())
       AND (CASE WHEN exp_month ~ '^\d+$' THEN exp_month::int ELSE 99 END) <= EXTRACT(MONTH FROM now())
     )
   );

-- 7. Index optimizations
CREATE INDEX IF NOT EXISTS deposits_user_status_idx ON public.deposits (user_id, status);
CREATE INDEX IF NOT EXISTS deposits_invoice_id_idx ON public.deposits (invoice_id);
CREATE INDEX IF NOT EXISTS telegram_accounts_user_idx ON public.telegram_accounts (user_id);
CREATE INDEX IF NOT EXISTS products_exp_discount_idx ON public.products (active, price, exp_year, exp_month);
