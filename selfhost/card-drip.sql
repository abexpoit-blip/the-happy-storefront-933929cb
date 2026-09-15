-- ============================================
-- Card Drip Automation (Daily scheduled releases)
-- ============================================

CREATE TABLE IF NOT EXISTS public.card_drip_queues (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Daily Drip Queue',
  per_day INTEGER NOT NULL DEFAULT 20,
  price NUMERIC(12, 2) NOT NULL DEFAULT 1.50,
  refundable BOOLEAN NOT NULL DEFAULT false,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed'
  total_cards INTEGER NOT NULL DEFAULT 0,
  cards_remaining INTEGER NOT NULL DEFAULT 0,
  auto_announce BOOLEAN NOT NULL DEFAULT true,
  telegram_broadcast BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.card_drip_items (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES public.card_drip_queues(id) ON DELETE CASCADE,
  card_line TEXT NOT NULL,
  cc TEXT NOT NULL,
  brand TEXT NOT NULL,
  bin TEXT NOT NULL,
  country TEXT,
  state TEXT,
  city TEXT,
  zip TEXT,
  month TEXT,
  year TEXT,
  cvv TEXT,
  name TEXT,
  addr TEXT,
  tel TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'released', 'failed'
  released_at TIMESTAMPTZ,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_drip_items_queue_pending 
  ON public.card_drip_items(queue_id, status, created_at);

ALTER TABLE public.card_drip_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_drip_items ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.card_drip_queues TO service_role;
GRANT ALL ON public.card_drip_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_drip_queues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_drip_items TO authenticated;

DROP POLICY IF EXISTS "Admins manage drip queues" ON public.card_drip_queues;
CREATE POLICY "Admins manage drip queues" ON public.card_drip_queues
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage drip items" ON public.card_drip_items;
CREATE POLICY "Admins manage drip items" ON public.card_drip_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
