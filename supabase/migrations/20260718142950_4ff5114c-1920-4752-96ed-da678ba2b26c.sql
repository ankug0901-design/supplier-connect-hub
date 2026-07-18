ALTER TABLE public.rfq_portal_requests DROP CONSTRAINT IF EXISTS rfq_portal_requests_status_check;
ALTER TABLE public.rfq_portal_requests ADD CONSTRAINT rfq_portal_requests_status_check
  CHECK (status = ANY (ARRAY['pending','quote_submitted','quoted_incomplete','accepted','rejected','expired']));