ALTER TABLE public.rfq_portal_requests ADD COLUMN supplier_company text;

UPDATE public.rfq_portal_requests r
SET supplier_company = s.company
FROM public.suppliers s
WHERE lower(r.supplier_email) = lower(s.email)
  AND r.supplier_company IS NULL;