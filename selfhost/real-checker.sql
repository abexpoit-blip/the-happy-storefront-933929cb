-- Real card checker (CheckerCCV) support.
-- Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS public.checker_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id text NOT NULL UNIQUE,
  gate text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  settled integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.checker_tasks TO authenticated;
GRANT ALL ON public.checker_tasks TO service_role;
ALTER TABLE public.checker_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='checker_tasks' AND policyname='own tasks') THEN
    CREATE POLICY "own tasks" ON public.checker_tasks FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS checker_tasks_user_idx ON public.checker_tasks(user_id, created_at DESC);

-- Settle a single check with a real gateway verdict; DEAD refunds the card price.
CREATE OR REPLACE FUNCTION public.settle_card_check(_check_id uuid, _status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _c RECORD;
BEGIN
  IF _status NOT IN ('live','dead') THEN RETURN 'invalid_status'; END IF;

  SELECT * INTO _c FROM card_checks WHERE id = _check_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF _c.status <> 'pending' THEN RETURN 'already_settled'; END IF;

  UPDATE card_checks
     SET status = _status,
         refunded = CASE WHEN _status = 'dead' THEN _c.price ELSE 0 END
   WHERE id = _c.id;

  IF _status = 'dead' THEN
    UPDATE profiles SET balance = balance + _c.price WHERE id = _c.user_id;
    INSERT INTO balance_transactions (user_id, amount, kind, description)
    VALUES (_c.user_id, _c.price, 'refund', 'Refund — dead card (gateway check)');
  END IF;

  RETURN _status;
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_card_check(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_card_check(uuid, text) TO service_role;

INSERT INTO public.site_settings (key, value) VALUES
  ('checker_mode', 'real'),
  ('checker_gate', 'CCV_Braintree_Auth')
ON CONFLICT (key) DO NOTHING;
