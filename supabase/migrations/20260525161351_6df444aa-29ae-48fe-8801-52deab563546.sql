
-- 1) Admin policy on challan_items
CREATE POLICY "Admins manage all challan items"
ON public.challan_items
FOR ALL
TO public
USING (is_admin())
WITH CHECK (is_admin());

-- 2) Harden rfq_portal_requests: auto-resolve supplier_id from email, drop email-based predicate
CREATE OR REPLACE FUNCTION public.rfq_portal_requests_resolve_supplier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NULL AND NEW.supplier_email IS NOT NULL THEN
    SELECT s.id INTO NEW.supplier_id
    FROM public.suppliers s
    WHERE lower(s.email) = lower(NEW.supplier_email)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rfq_portal_requests_resolve_supplier ON public.rfq_portal_requests;
CREATE TRIGGER trg_rfq_portal_requests_resolve_supplier
BEFORE INSERT ON public.rfq_portal_requests
FOR EACH ROW EXECUTE FUNCTION public.rfq_portal_requests_resolve_supplier();

DROP POLICY IF EXISTS "Suppliers can view own RFQ rows" ON public.rfq_portal_requests;
CREATE POLICY "Suppliers can view own RFQ rows"
ON public.rfq_portal_requests
FOR SELECT
TO authenticated
USING (
  supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Suppliers can update own RFQ rows" ON public.rfq_portal_requests;
CREATE POLICY "Suppliers can update own RFQ rows"
ON public.rfq_portal_requests
FOR UPDATE
TO authenticated
USING (
  supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
)
WITH CHECK (
  supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
);

-- Backfill supplier_id for existing rows where possible
UPDATE public.rfq_portal_requests r
SET supplier_id = s.id
FROM public.suppliers s
WHERE r.supplier_id IS NULL
  AND r.supplier_email IS NOT NULL
  AND lower(s.email) = lower(r.supplier_email);

-- 3) Drop duplicate unrestricted storage INSERT policy
DROP POLICY IF EXISTS "Suppliers can upload own documents" ON storage.objects;
