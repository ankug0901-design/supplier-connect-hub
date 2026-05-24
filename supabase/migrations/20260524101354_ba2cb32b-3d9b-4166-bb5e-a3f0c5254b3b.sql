
-- 1. Add actual_delivery_date column to invoice_line_items
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS actual_delivery_date date;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_actual_delivery
  ON public.invoice_line_items(actual_delivery_date);

-- 2. Update record_invoice_line_items to accept actual_delivery_date in each item
CREATE OR REPLACE FUNCTION public.record_invoice_line_items(
  _supplier_id uuid,
  _po_number text,
  _invoice_number text,
  _items jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.invoice_line_items (supplier_id, po_number, invoice_number, item_name, quantity, rate, actual_delivery_date)
  SELECT
    _supplier_id,
    _po_number,
    _invoice_number,
    COALESCE(item->>'item_name', ''),
    COALESCE((item->>'quantity')::numeric, 0),
    COALESCE((item->>'rate')::numeric, 0),
    NULLIF(item->>'actual_delivery_date', '')::date
  FROM jsonb_array_elements(_items) AS item
  WHERE COALESCE(item->>'item_name', '') <> ''
    AND COALESCE((item->>'quantity')::numeric, 0) > 0;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$;

-- 3. View to compute delivery performance per supplier
CREATE OR REPLACE VIEW public.supplier_delivery_performance AS
SELECT
  ili.supplier_id,
  ili.po_number,
  ili.invoice_number,
  ili.item_name,
  ili.quantity,
  ili.actual_delivery_date,
  po.expected_delivery,
  (ili.actual_delivery_date - po.expected_delivery) AS days_variance,
  CASE
    WHEN ili.actual_delivery_date IS NULL OR po.expected_delivery IS NULL THEN NULL
    WHEN ili.actual_delivery_date <= po.expected_delivery THEN true
    ELSE false
  END AS on_time
FROM public.invoice_line_items ili
LEFT JOIN public.purchase_orders po
  ON po.supplier_id = ili.supplier_id AND po.po_number = ili.po_number;
