
-- Admin can view all invoice line items
CREATE POLICY "Admins view all invoice line items"
ON public.invoice_line_items FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins insert any invoice line items"
ON public.invoice_line_items FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

-- Security definer RPC: insert line items for a supplier the caller is allowed to act for
CREATE OR REPLACE FUNCTION public.record_invoice_line_items(
  _supplier_id uuid,
  _po_number text,
  _invoice_number text,
  _items jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean;
  inserted_count integer := 0;
BEGIN
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = _supplier_id AND user_id = auth.uid()
  ) INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Not authorized to record invoice line items for this supplier';
  END IF;

  INSERT INTO public.invoice_line_items (supplier_id, po_number, invoice_number, item_name, quantity, rate)
  SELECT
    _supplier_id,
    _po_number,
    _invoice_number,
    COALESCE(item->>'item_name', ''),
    COALESCE((item->>'quantity')::numeric, 0),
    COALESCE((item->>'rate')::numeric, 0)
  FROM jsonb_array_elements(_items) AS item
  WHERE COALESCE(item->>'item_name', '') <> ''
    AND COALESCE((item->>'quantity')::numeric, 0) > 0;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_invoice_line_items(uuid, text, text, jsonb) TO authenticated;

-- Security definer RPC: aggregate previously invoiced qty per item for a PO
CREATE OR REPLACE FUNCTION public.get_invoiced_quantities_for_po(
  _supplier_id uuid,
  _po_number text
) RETURNS TABLE(item_name text, total_quantity numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = _supplier_id AND user_id = auth.uid()
  )) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT lower(trim(ili.item_name)) AS item_name,
         SUM(ili.quantity) AS total_quantity
  FROM public.invoice_line_items ili
  WHERE ili.supplier_id = _supplier_id AND ili.po_number = _po_number
  GROUP BY lower(trim(ili.item_name));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoiced_quantities_for_po(uuid, text) TO authenticated;
