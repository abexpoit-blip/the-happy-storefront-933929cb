CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ticket messages" ON public.support_messages
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "Users add messages to own tickets" ON public.support_messages
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND (
      public.has_role(auth.uid(),'admin')
      OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
    )
  );

CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id, last_activity_at DESC);
CREATE INDEX idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);

CREATE TRIGGER trg_support_tickets_updated BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.trg_support_message_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets
     SET last_activity_at = now(),
         status = CASE WHEN NEW.is_staff THEN 'answered' ELSE 'open' END
   WHERE id = NEW.ticket_id AND status <> 'closed';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_support_activity AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_support_message_activity();