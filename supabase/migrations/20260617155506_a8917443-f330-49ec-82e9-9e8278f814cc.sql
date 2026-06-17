GRANT SELECT ON public.vendor_scores TO authenticated;
CREATE POLICY "Suppliers can view their own vendor scores"
ON public.vendor_scores
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = vendor_scores.supplier_id
      AND s.user_id = auth.uid()
  )
);