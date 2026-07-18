ALTER TABLE public.rfq_portal_requests
  ADD COLUMN IF NOT EXISTS quote_validity_days integer,
  ADD COLUMN IF NOT EXISTS quote_source text,
  ADD COLUMN IF NOT EXISTS quote_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_parsing_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS quote_raw_email_body text,
  ADD COLUMN IF NOT EXISTS quote_email_message_id text;