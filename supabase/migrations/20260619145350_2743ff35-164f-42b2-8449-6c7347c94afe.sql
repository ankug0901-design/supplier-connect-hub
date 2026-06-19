
-- Tighten anon RFQ insert to forbid sensitive admin/business fields
DROP POLICY IF EXISTS "Anon can insert rfq_portal_requests" ON public.rfq_portal_requests;
CREATE POLICY "Anon can insert rfq_portal_requests"
ON public.rfq_portal_requests
FOR INSERT
TO anon
WITH CHECK (
  supplier_id IS NULL
  AND emboss_decision IS NULL
  AND emboss_notes IS NULL
  AND price_rank IS NULL
  AND decided_at IS NULL
  AND rfq_closed_at IS NULL
);

-- Prevent suppliers from changing their email (which controls storage path access)
DROP POLICY IF EXISTS "Suppliers can update own profile" ON public.suppliers;
CREATE POLICY "Suppliers can update own profile"
ON public.suppliers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND role = 'supplier'
  AND email = (SELECT s.email FROM public.suppliers s WHERE s.user_id = auth.uid())
);
