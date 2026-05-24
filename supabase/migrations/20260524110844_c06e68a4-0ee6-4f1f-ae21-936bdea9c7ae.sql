CREATE TABLE public.three_way_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Client invoice (from Zoho / sales side)
  client_invoice_number TEXT,
  client_invoice_date DATE,
  client_invoice_amount NUMERIC DEFAULT 0,
  client_name TEXT,
  client_invoice_status TEXT,
  -- Supplier invoice (from supplier portal)
  supplier_invoice_number TEXT,
  supplier_invoice_date DATE,
  supplier_invoice_amount NUMERIC DEFAULT 0,
  supplier_id UUID,
  supplier_name TEXT,
  supplier_company TEXT,
  -- PO link
  po_number TEXT,
  -- Quantities
  client_quantity NUMERIC DEFAULT 0,
  supplier_quantity NUMERIC DEFAULT 0,
  quantity_match BOOLEAN DEFAULT false,
  amount_match BOOLEAN DEFAULT false,
  -- Client payment
  client_payment_received BOOLEAN DEFAULT false,
  client_payment_date DATE,
  client_payment_amount NUMERIC DEFAULT 0,
  client_payment_reference TEXT,
  -- Supplier payment release
  supplier_payment_status TEXT DEFAULT 'pending',
  supplier_payment_eligible BOOLEAN DEFAULT false,
  -- Overall
  match_status TEXT DEFAULT 'unmatched',
  notes TEXT,
  raw_payload JSONB,
  matched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX three_way_matches_unique_combo
  ON public.three_way_matches (
    COALESCE(client_invoice_number, ''),
    COALESCE(supplier_invoice_number, ''),
    COALESCE(po_number, '')
  );

CREATE INDEX idx_twm_supplier ON public.three_way_matches (supplier_id);
CREATE INDEX idx_twm_match_status ON public.three_way_matches (match_status);
CREATE INDEX idx_twm_supplier_payment_status ON public.three_way_matches (supplier_payment_status);

ALTER TABLE public.three_way_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to three_way_matches"
  ON public.three_way_matches
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Service role full access to three_way_matches"
  ON public.three_way_matches
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_three_way_matches_updated_at
BEFORE UPDATE ON public.three_way_matches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();