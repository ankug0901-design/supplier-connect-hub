CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE NOT NULL,
  po_number text NOT NULL,
  invoice_number text NOT NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_line_items_supplier_po ON public.invoice_line_items(supplier_id, po_number);
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Suppliers view own invoice line items"
ON public.invoice_line_items FOR SELECT TO authenticated
USING (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));

CREATE POLICY "Suppliers insert own invoice line items"
ON public.invoice_line_items FOR INSERT TO authenticated
WITH CHECK (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));