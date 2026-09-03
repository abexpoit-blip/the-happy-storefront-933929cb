-- 1. Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid;

UPDATE public.profiles
   SET referral_code = upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
 WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code);
CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles (referred_by);

-- 2. Referrals ledger
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL UNIQUE,
  bonus_amount numeric NOT NULL DEFAULT 5,
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

-- 3. Default bonus setting
INSERT INTO public.site_settings (key, value)
VALUES ('referral_bonus', '5')
ON CONFLICT (key) DO NOTHING;

-- 4. Signup: assign own code + link referrer from metadata
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
  VALUES (NEW.id, _username, NEW.email, _code, _referrer);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'buyer');

  RETURN NEW;
END;
$function$;

-- 5. One-time referral payout on first approved deposit
CREATE OR REPLACE FUNCTION public.award_referral_bonus(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _referrer uuid;
  _bonus numeric;
BEGIN
  SELECT referred_by INTO _referrer FROM public.profiles WHERE id = _user_id;
  IF _referrer IS NULL OR _referrer = _user_id THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = _user_id) THEN RETURN false; END IF;

  SELECT COALESCE(NULLIF(value,'')::numeric, 5) INTO _bonus FROM public.site_settings WHERE key = 'referral_bonus';
  _bonus := COALESCE(_bonus, 5);
  IF _bonus <= 0 THEN RETURN false; END IF;

  INSERT INTO public.referrals (referrer_id, referee_id, bonus_amount)
  VALUES (_referrer, _user_id, _bonus)
  ON CONFLICT (referee_id) DO NOTHING;

  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.profiles SET balance = balance + _bonus WHERE id IN (_referrer, _user_id);

  INSERT INTO public.balance_transactions (user_id, amount, kind, description)
  VALUES (_referrer, _bonus, 'referral', 'Referral bonus'),
         (_user_id, _bonus, 'referral', 'Referral welcome bonus');

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_deposit_referral_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    PERFORM public.award_referral_bonus(NEW.user_id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS deposits_referral_bonus ON public.deposits;
CREATE TRIGGER deposits_referral_bonus
AFTER UPDATE OF status ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.trg_deposit_referral_bonus();