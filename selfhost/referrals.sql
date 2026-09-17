-- Referral program (idempotent).
-- Run on the VPS:  docker exec -i supabase-db psql -U postgres -d postgres < selfhost/referrals.sql

-- 1. Ensure required columns exist on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS bonus_balance numeric NOT NULL DEFAULT 0;

UPDATE public.profiles
   SET referral_code = upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
 WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code);
CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles (referred_by);

-- 2. Ensure balance_transactions ledger table exists
CREATE TABLE IF NOT EXISTS public.balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  kind text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.balance_transactions TO authenticated;
GRANT ALL ON public.balance_transactions TO service_role;
ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users view own transactions" ON public.balance_transactions
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins insert transactions" ON public.balance_transactions
    FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Referrals log table
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL UNIQUE,
  bonus_amount numeric NOT NULL DEFAULT 5.00,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own referrals" ON public.referrals;
CREATE POLICY "Users view own referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referee_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins manage referrals" ON public.referrals;
CREATE POLICY "Admins manage referrals" ON public.referrals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id);

-- 4. Site Settings:
-- Web referral bonus = $5.00 (migrate any old 0.10 values to 5)
-- Bot referral bonus = $0.10 (separate key for telegram bot)
INSERT INTO public.site_settings (key, value)
VALUES ('referral_bonus', '5')
ON CONFLICT (key) DO UPDATE SET value = '5' WHERE site_settings.value IN ('0.10', '0.1', '0.1000');

INSERT INTO public.site_settings (key, value)
VALUES ('bot_referral_bonus', '0.10')
ON CONFLICT (key) DO NOTHING;

-- 5. User creation trigger (populates referral_code and referred_by)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _username TEXT;
  _base TEXT;
  _suffix INT := 0;
  _code TEXT;
  _ref_code TEXT;
  _referrer uuid;
BEGIN
  _base := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    split_part(NEW.email, '@', 1),
    'user'
  );
  _username := _base;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = _username) LOOP
    _suffix := _suffix + 1;
    _username := _base || _suffix::text;
  END LOOP;

  LOOP
    _code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = _code);
  END LOOP;

  _ref_code := upper(NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'ref', NEW.raw_user_meta_data ->> 'referral_code', '')), ''));
  IF _ref_code IS NOT NULL THEN
    SELECT id INTO _referrer FROM public.profiles WHERE referral_code = _ref_code;
  END IF;

  INSERT INTO public.profiles (id, username, email, referral_code, referred_by)
  VALUES (NEW.id, _username, NEW.email, _code, _referrer)
  ON CONFLICT (id) DO UPDATE
    SET referral_code = COALESCE(public.profiles.referral_code, EXCLUDED.referral_code),
        referred_by = COALESCE(public.profiles.referred_by, EXCLUDED.referred_by);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'buyer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- 6. Award referral bonus on first approved deposit
CREATE OR REPLACE FUNCTION public.award_referral_bonus(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _referrer uuid;
  _bonus numeric;
  _is_bot boolean := false;
BEGIN
  SELECT referred_by INTO _referrer FROM public.profiles WHERE id = _user_id;
  IF _referrer IS NULL OR _referrer = _user_id THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = _user_id) THEN RETURN false; END IF;

  -- Check whether referee joined via Telegram Bot
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_accounts') THEN
    SELECT EXISTS (SELECT 1 FROM public.telegram_accounts WHERE user_id = _user_id) INTO _is_bot;
  END IF;

  IF _is_bot THEN
    -- Telegram Bot referral: $0.10
    SELECT COALESCE(NULLIF(value,'')::numeric, 0.10) INTO _bonus FROM public.site_settings WHERE key = 'bot_referral_bonus';
    _bonus := COALESCE(_bonus, 0.10);
  ELSE
    -- Website referral: $5.00
    SELECT COALESCE(NULLIF(value,'')::numeric, 5.00) INTO _bonus FROM public.site_settings WHERE key = 'referral_bonus';
    _bonus := COALESCE(_bonus, 5.00);
  END IF;

  IF _bonus <= 0 THEN RETURN false; END IF;

  -- Insert referral record (unique per referee guarantees paid only ONCE)
  INSERT INTO public.referrals (referrer_id, referee_id, bonus_amount)
  VALUES (_referrer, _user_id, _bonus)
  ON CONFLICT (referee_id) DO NOTHING;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Award bonus to BOTH referrer and referee (on bonus balance)
  UPDATE public.profiles
     SET bonus_balance = COALESCE(bonus_balance, 0) + _bonus
   WHERE id IN (_referrer, _user_id);

  -- Record balance transactions safely
  BEGIN
    INSERT INTO public.balance_transactions (user_id, amount, kind, description)
    VALUES (_referrer, _bonus, 'referral', 'Referral bonus (bonus balance)'),
           (_user_id, _bonus, 'referral', 'Referral welcome bonus (bonus balance)');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- table or constraint error does not block the bonus
  END;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'award_referral_bonus error: %', SQLERRM;
  RETURN false;
END;
$function$;

-- 7. Trigger on deposit approval
CREATE OR REPLACE FUNCTION public.trg_deposit_referral_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') <> 'approved') THEN
    PERFORM public.award_referral_bonus(NEW.user_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_deposit_referral_bonus error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS deposits_referral_bonus ON public.deposits;
CREATE TRIGGER deposits_referral_bonus
AFTER INSERT OR UPDATE OF status ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.trg_deposit_referral_bonus();

GRANT EXECUTE ON FUNCTION public.award_referral_bonus(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_deposit_referral_bonus() TO authenticated, service_role;
