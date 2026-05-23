
-- 1. Storage: remove overly broad SELECT policy on supplier-documents
DROP POLICY IF EXISTS "Suppliers can read own documents" ON storage.objects;

-- 2. rfq_portal_requests: prevent non-admin suppliers from modifying admin-only fields
CREATE OR REPLACE FUNCTION public.prevent_rfq_admin_field_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.emboss_decision IS DISTINCT FROM OLD.emboss_decision
     OR NEW.price_rank IS DISTINCT FROM OLD.price_rank
     OR NEW.emboss_notes IS DISTINCT FROM OLD.emboss_notes THEN
    RAISE EXCEPTION 'Only admins can modify admin-controlled RFQ fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rfq_admin_field_guard ON public.rfq_portal_requests;
CREATE TRIGGER rfq_admin_field_guard
BEFORE UPDATE ON public.rfq_portal_requests
FOR EACH ROW EXECUTE FUNCTION public.prevent_rfq_admin_field_update();

-- 3. Set immutable search_path on remaining SECURITY DEFINER functions
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 4. Revoke EXECUTE on internal email-queue SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, public;
