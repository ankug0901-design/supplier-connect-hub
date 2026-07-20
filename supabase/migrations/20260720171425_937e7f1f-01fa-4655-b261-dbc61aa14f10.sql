
-- Fix 1: invoice_line_items add UPDATE + DELETE policies for admins and suppliers
CREATE POLICY "Admins update any invoice line items" ON public.invoice_line_items
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete any invoice line items" ON public.invoice_line_items
  FOR DELETE USING (public.is_admin());
CREATE POLICY "Suppliers update own invoice line items" ON public.invoice_line_items
  FOR UPDATE USING (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()))
  WITH CHECK (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));

-- Fix 2: rfq_item_quotes - replace email-based policies with supplier_id FK
ALTER TABLE public.rfq_item_quotes ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE;

-- Backfill supplier_id from supplier_email
UPDATE public.rfq_item_quotes q
SET supplier_id = s.id
FROM public.suppliers s
WHERE q.supplier_id IS NULL AND lower(s.email) = lower(q.supplier_email);

CREATE INDEX IF NOT EXISTS idx_rfq_item_quotes_supplier_id ON public.rfq_item_quotes(supplier_id);

-- Drop old email-based policies
DROP POLICY IF EXISTS "Suppliers insert own item quotes" ON public.rfq_item_quotes;
DROP POLICY IF EXISTS "Suppliers update own item quotes" ON public.rfq_item_quotes;
DROP POLICY IF EXISTS "Suppliers view own item quotes" ON public.rfq_item_quotes;

-- Recreate scoped by supplier_id tied to auth.uid()
CREATE POLICY "Suppliers view own item quotes" ON public.rfq_item_quotes
  FOR SELECT USING (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));
CREATE POLICY "Suppliers insert own item quotes" ON public.rfq_item_quotes
  FOR INSERT WITH CHECK (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));
CREATE POLICY "Suppliers update own item quotes" ON public.rfq_item_quotes
  FOR UPDATE USING (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()))
  WITH CHECK (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));
