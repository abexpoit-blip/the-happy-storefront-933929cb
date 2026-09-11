-- =============================================================
-- selfhost/bot-admin.sql
-- Run once on VPS:  psql $DATABASE_URL < selfhost/bot-admin.sql
-- =============================================================

-- Site and Bot settings (stored in the existing site_settings KV table)
INSERT INTO site_settings (key, value) VALUES
  ('site_maintenance',       'false'),
  ('site_maintenance_msg',   'Сайт временно закрыт на плановое техническое обслуживание. Пожалуйста, зайдите позже.'),
  ('enabled_checker_gates',  '[]'),
  ('payment_crypto_enabled', 'true'),
  ('bot_maintenance',        'false'),
  ('bot_maintenance_msg',    '🔧 Bot is under maintenance. Please check back shortly.'),
  ('bot_notice',             ''),
  ('checker_enabled',        'true')
ON CONFLICT (key) DO NOTHING;

-- Broadcast log
CREATE TABLE IF NOT EXISTS bot_broadcasts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  text         text        NOT NULL,
  sent_count   integer     NOT NULL DEFAULT 0,
  failed_count integer     NOT NULL DEFAULT 0,
  target       text        NOT NULL DEFAULT 'all',
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES profiles(id)
);

ALTER TABLE bot_broadcasts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bot_broadcasts' AND policyname = 'admin_only_bot_broadcasts'
  ) THEN
    CREATE POLICY admin_only_bot_broadcasts ON bot_broadcasts
      USING (
        auth.uid() IN (
          SELECT id FROM profiles WHERE role = 'admin'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bot_broadcasts_created_at_idx ON bot_broadcasts (created_at DESC);
