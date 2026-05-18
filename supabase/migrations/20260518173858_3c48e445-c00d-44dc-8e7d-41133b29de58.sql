
-- 1. RFQ portal requests: enable RLS + scoped policies
ALTER TABLE public.rfq_portal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can update rfq_portal_requests" ON public.rfq_portal_requests;

CREATE POLICY "Admin full access to rfq_portal_requests"
  ON public.rfq_portal_requests
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Suppliers can view own RFQ rows"
  ON public.rfq_portal_requests
  FOR SELECT
  TO authenticated
  USING (
    supplier_email = (auth.jwt() ->> 'email')
    OR supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "Suppliers can update own RFQ rows"
  ON public.rfq_portal_requests
  FOR UPDATE
  TO authenticated
  USING (
    supplier_email = (auth.jwt() ->> 'email')
    OR supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    supplier_email = (auth.jwt() ->> 'email')
    OR supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

-- 2. Prevent supplier role escalation
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_supplier_role_escalation ON public.suppliers;
CREATE TRIGGER prevent_supplier_role_escalation
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- 3. Admin policy on po_items
CREATE POLICY "Admin full access to po_items"
  ON public.po_items
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Tighten supplier-documents storage (path: registrations/{email}/...)
DROP POLICY IF EXISTS "Authenticated users can read supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Suppliers read own documents or admins read all" ON storage.objects;
DROP POLICY IF EXISTS "Suppliers upload to own folder or admins anywhere" ON storage.objects;

CREATE POLICY "Suppliers read own documents or admins read all"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'supplier-documents'
    AND (
      (storage.foldername(name))[2] = (auth.jwt() ->> 'email')
      OR public.is_admin()
    )
  );

CREATE POLICY "Suppliers upload to own folder or admins anywhere"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-documents'
    AND (
      (storage.foldername(name))[2] = (auth.jwt() ->> 'email')
      OR public.is_admin()
    )
  );

-- 5. Lock down pgmq RPC wrappers to service role only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
