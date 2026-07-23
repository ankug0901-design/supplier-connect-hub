
ALTER TABLE public.rfq_portal_requests
  ADD COLUMN IF NOT EXISTS boq_template_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS boq_template_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS boq_response_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS boq_response_name text DEFAULT '';
