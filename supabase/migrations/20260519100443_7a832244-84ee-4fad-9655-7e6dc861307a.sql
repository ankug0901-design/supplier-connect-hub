ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_attachment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_name text;