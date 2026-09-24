-- Auto-expire deposits older than 30 minutes that are still pending
CREATE OR REPLACE FUNCTION public.expire_stale_deposits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  -- Mark all unpaid deposits older than 30 minutes or past expires_at as rejected
  UPDATE public.deposits
     SET status = 'rejected',
         admin_note = COALESCE(admin_note, 'Expired: unpaid after 30 minutes')
   WHERE status = 'pending'
     AND (
       (expires_at IS NOT NULL AND expires_at < now())
       OR (created_at < now() - interval '30 minutes')
     );
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- Allow authenticated users, service_role, and anon to trigger expire safely
GRANT EXECUTE ON FUNCTION public.expire_stale_deposits() TO authenticated, service_role, anon;

-- Run it immediately on migration
SELECT public.expire_stale_deposits();
