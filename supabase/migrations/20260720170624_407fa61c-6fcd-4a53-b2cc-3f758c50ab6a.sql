DROP POLICY IF EXISTS "Suppliers can view own POs" ON public.purchase_orders;
CREATE POLICY "Suppliers can view own POs" ON public.purchase_orders
FOR SELECT USING (
  supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  AND COALESCE(lower(status), '') IN ('approved','open','partial','partially_billed','billed','invoiced','completed','closed')
);