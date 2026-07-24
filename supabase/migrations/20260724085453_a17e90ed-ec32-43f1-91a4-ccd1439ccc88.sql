
-- Fix 1: Remove broad bucket-only BOQ storage policies; keep ownership-scoped ones
DROP POLICY IF EXISTS "BOQ responses authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "BOQ responses authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "BOQ templates authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "BOQ templates authenticated uploads" ON storage.objects;

-- Allow suppliers invited to an RFQ to read that RFQ's BOQ template (folder = rfq_id)
CREATE POLICY "boq_templates_invited_supplier_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rfq-boq-templates'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM public.rfq_portal_requests r
        JOIN public.suppliers s ON s.id = r.supplier_id
        WHERE s.user_id = auth.uid()
          AND (storage.foldername(storage.objects.name))[1] = r.rfq_id
      )
    )
  );

-- Drop pre-existing broad templates read policy as well (same broad exposure)
DROP POLICY IF EXISTS "boq_templates_auth_read" ON storage.objects;

-- Fix 2: Narrow RFQ managers' supplier directory read to admins only
DROP POLICY IF EXISTS "RFQ managers can read supplier directory" ON public.suppliers;
