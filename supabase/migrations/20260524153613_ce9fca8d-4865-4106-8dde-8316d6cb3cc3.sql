-- Clear stale invoice-level rows (they don't fit SO-level shape)
DELETE FROM public.three_way_matches;

-- Drop old unique constraint (invoice-level)
ALTER TABLE public.three_way_matches
  DROP CONSTRAINT IF EXISTS three_way_matches_client_invoice_number_supplier_invoice_n_key;

-- Add SO-level columns
ALTER TABLE public.three_way_matches
  ADD COLUMN IF NOT EXISTS so_number text,
  ADD COLUMN IF NOT EXISTS client_invoices jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS supplier_invoices jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS po_numbers text[] NOT NULL DEFAULT '{}'::text[];

-- New unique key: one row per SO
CREATE UNIQUE INDEX IF NOT EXISTS three_way_matches_so_number_key
  ON public.three_way_matches (so_number)
  WHERE so_number IS NOT NULL;