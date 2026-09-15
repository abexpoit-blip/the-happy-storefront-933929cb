-- Consolidated fix for bot_broadcasts and telegram_accounts schema
-- Run on VPS:
--   docker exec -i supabase-db psql -U postgres -d postgres < selfhost/bot-broadcasts.sql

-- 1. Create bot_broadcasts table
CREATE TABLE IF NOT EXISTS public.bot_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  target text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_broadcasts TO service_role;
GRANT SELECT ON public.bot_broadcasts TO authenticated;
ALTER TABLE public.bot_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only_bot_broadcasts ON public.bot_broadcasts;
CREATE POLICY admin_only_bot_broadcasts ON public.bot_broadcasts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS bot_broadcasts_created_at_idx ON public.bot_broadcasts (created_at DESC);

-- 2. Ensure all required columns exist on telegram_accounts
CREATE TABLE IF NOT EXISTS public.telegram_accounts (
  telegram_id bigint PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  username text,
  first_name text,
  gate text,
  banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_accounts ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.telegram_accounts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.telegram_accounts ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.telegram_accounts ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.telegram_accounts ADD COLUMN IF NOT EXISTS gate text;
ALTER TABLE public.telegram_accounts ADD COLUMN IF NOT EXISTS username text;

GRANT ALL ON public.telegram_accounts TO service_role;
GRANT SELECT ON public.telegram_accounts TO authenticated;
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_select_telegram_accounts ON public.telegram_accounts;
CREATE POLICY admin_select_telegram_accounts ON public.telegram_accounts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
