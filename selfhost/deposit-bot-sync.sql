-- Ensure deposits and bot account synchronization (idempotent)
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

-- 4. Index optimizations
CREATE INDEX IF NOT EXISTS deposits_user_status_idx ON public.deposits (user_id, status);
CREATE INDEX IF NOT EXISTS deposits_invoice_id_idx ON public.deposits (invoice_id);
CREATE INDEX IF NOT EXISTS telegram_accounts_user_idx ON public.telegram_accounts (user_id);
