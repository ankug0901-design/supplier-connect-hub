DROP INDEX IF EXISTS public.three_way_matches_unique_combo;
ALTER TABLE public.three_way_matches
  ADD CONSTRAINT three_way_matches_unique_combo
  UNIQUE (client_invoice_number, supplier_invoice_number, po_number);