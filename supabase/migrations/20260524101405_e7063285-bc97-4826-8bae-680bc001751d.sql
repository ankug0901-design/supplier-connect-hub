
DROP VIEW IF EXISTS public.supplier_delivery_performance;

CREATE VIEW public.supplier_delivery_performance
WITH (security_invoker = true) AS
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
