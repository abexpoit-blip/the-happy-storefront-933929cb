-- ============================================================
-- Pay-per-successful-check.
--   Credits are held when a task starts, but only cards the gateway
--   actually answered (LIVE / DEAD) are billed. Every other card
--   (error, skipped, never returned) gets its credits back.
-- Idempotent: safe to run multiple times.
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/check-refund.sql
-- ============================================================

ALTER TABLE public.self_checks
  ADD COLUMN IF NOT EXISTS refunded_credits integer NOT NULL DEFAULT 0;

ALTER TABLE public.checker_tasks
  ADD COLUMN IF NOT EXISTS refunded_credits integer NOT NULL DEFAULT 0;

-- Refund helper (service role only) — also used for failed cards, not just gateway errors.
CREATE OR REPLACE FUNCTION public.refund_check_credits(_user_id uuid, _credits integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(_credits,0) <= 0 THEN RETURN; END IF;
  UPDATE profiles SET check_credits = check_credits + _credits WHERE id = _user_id;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_user_id, 0, 'check_credits', 'Refunded ' || _credits || ' credits (cards not checked)');
END;
$$;

REVOKE ALL ON FUNCTION public.refund_check_credits(uuid, integer) FROM PUBLIC, anon, authenticated;

-- One-time credit refund marker per bought refund card.
ALTER TABLE public.card_checks
  ADD COLUMN IF NOT EXISTS credits_refunded boolean NOT NULL DEFAULT false;
