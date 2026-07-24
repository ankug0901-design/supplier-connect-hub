
-- 1) rfq-attachments: drop broad authenticated policies (admin policies remain)
DROP POLICY IF EXISTS "RFQ attachments authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "RFQ attachments authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "RFQ attachments authenticated uploads" ON storage.objects;

-- 2) rfq-boq-responses: replace email-folder matching with supplier-ownership check
DROP POLICY IF EXISTS boq_responses_read ON storage.objects;
DROP POLICY IF EXISTS boq_responses_supplier_insert ON storage.objects;
DROP POLICY IF EXISTS boq_responses_supplier_update ON storage.objects;

CREATE POLICY boq_responses_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rfq-boq-responses'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.rfq_portal_requests r
        JOIN public.suppliers s ON s.id = r.supplier_id
        WHERE r.rfq_id = (storage.foldername(name))[1]
          AND s.user_id = auth.uid()
      )
    )
  );

CREATE POLICY boq_responses_supplier_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rfq-boq-responses'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.rfq_portal_requests r
        JOIN public.suppliers s ON s.id = r.supplier_id
        WHERE r.rfq_id = (storage.foldername(name))[1]
          AND s.user_id = auth.uid()
      )
    )
  );

CREATE POLICY boq_responses_supplier_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rfq-boq-responses'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.rfq_portal_requests r
        JOIN public.suppliers s ON s.id = r.supplier_id
        WHERE r.rfq_id = (storage.foldername(name))[1]
          AND s.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'rfq-boq-responses'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.rfq_portal_requests r
        JOIN public.suppliers s ON s.id = r.supplier_id
        WHERE r.rfq_id = (storage.foldername(name))[1]
          AND s.user_id = auth.uid()
      )
    )
  );

-- 3) suppliers: prevent self-update of sensitive fields via trigger
CREATE OR REPLACE FUNCTION public.prevent_supplier_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  -- Non-admin (self) updates: preserve sensitive fields
  NEW.email           := OLD.email;
  NEW.gst_number      := OLD.gst_number;
  NEW.zoho_vendor_id  := OLD.zoho_vendor_id;
  NEW.company         := OLD.company;
  NEW.user_id         := OLD.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_supplier_sensitive_self_update_trg ON public.suppliers;
CREATE TRIGGER prevent_supplier_sensitive_self_update_trg
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_supplier_sensitive_self_update();
