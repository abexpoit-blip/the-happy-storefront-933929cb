REVOKE ALL ON FUNCTION public.award_referral_bonus(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_deposit_referral_bonus() FROM PUBLIC, anon, authenticated;