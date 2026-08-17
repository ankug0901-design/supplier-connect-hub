CREATE OR REPLACE FUNCTION public.dashboard_this_week()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  week_start DATE := DATE_TRUNC('week', CURRENT_DATE)::DATE;
  week_end   DATE := DATE_TRUNC('week', CURRENT_DATE)::DATE + 6;
  next_imminent JSON;
  v_days JSON;
BEGIN
  SELECT json_build_object(
    'type', 'rfq_closing',
    'rfq_id', rfq_id,
    'product_name', product_name,
    'closes_at', response_deadline,
    'response_count', (
      SELECT COUNT(*) FROM rfq_portal_requests r2
      WHERE r2.rfq_id = r.rfq_id AND r2.quote_submitted_at IS NOT NULL
    ),
    'total_invited', (
      SELECT COUNT(*) FROM rfq_portal_requests r2 WHERE r2.rfq_id = r.rfq_id
    )
  )
  INTO next_imminent
  FROM rfq_portal_requests r
  WHERE emboss_decision IS NULL
    AND response_deadline = CURRENT_DATE
  ORDER BY response_deadline ASC LIMIT 1;

  WITH day_series AS (
    SELECT (week_start + (n || ' days')::INTERVAL)::DATE AS d FROM generate_series(0, 6) n
  ),
  delivery_details AS (
    SELECT po.expected_delivery AS d,
      json_agg(json_build_object(
        'po_number', po.po_number,
        'supplier', COALESCE(s.company, s.name, '—'),
        'item', COALESCE((SELECT pi.item_name FROM po_items pi WHERE pi.po_id = po.id AND pi.item_name IS NOT NULL LIMIT 1), 'N/A')
      ) ORDER BY po.po_number) AS items
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.expected_delivery BETWEEN week_start AND week_end
      AND (po.status IS NULL OR po.status NOT IN ('completed','cancelled'))
    GROUP BY po.expected_delivery
  ),
  bill_details AS (
    SELECT i.due_date AS d,
      json_agg(json_build_object(
        'invoice_number', i.invoice_number,
        'supplier', COALESCE(s.company, s.name, '—'),
        'amount', ROUND(COALESCE(i.balance, i.amount) / 100000.0, 2)
      ) ORDER BY i.invoice_number) AS items
    FROM invoices i
    LEFT JOIN suppliers s ON s.id = i.supplier_id
    WHERE i.due_date BETWEEN week_start AND week_end
      AND (i.balance > 0 OR i.status = 'pending')
    GROUP BY i.due_date
  ),
  rfq_details AS (
    SELECT r.response_deadline AS d,
      json_agg(DISTINCT jsonb_build_object('rfq_id', r.rfq_id, 'product', COALESCE(r.product_name, r.rfq_id))::json) AS items
    FROM rfq_portal_requests r
    WHERE r.response_deadline BETWEEN week_start AND week_end
      AND r.emboss_decision IS NULL
    GROUP BY r.response_deadline
  ),
  payment_details AS (
    SELECT p.date AS d,
      json_agg(json_build_object(
        'reference', COALESCE(p.payment_number, p.transaction_id, '—'),
        'supplier', COALESCE(s.company, s.name, '—'),
        'amount', ROUND(p.amount / 100000.0, 2)
      ) ORDER BY p.payment_number) AS items
    FROM payments p
    LEFT JOIN invoices i ON i.id = p.invoice_id
    LEFT JOIN suppliers s ON s.id = i.supplier_id
    WHERE p.date BETWEEN week_start AND week_end
    GROUP BY p.date
  )
  SELECT json_agg(json_build_object(
    'date', ds.d,
    'day_name', TO_CHAR(ds.d, 'Dy'),
    'day_num', EXTRACT(DAY FROM ds.d)::INT,
    'is_today', ds.d = CURRENT_DATE,
    'deliveries_count', COALESCE(json_array_length(dd.items), 0),
    'bills_due_count', COALESCE(json_array_length(bd.items), 0),
    'rfqs_closing_count', COALESCE(json_array_length(rd.items), 0),
    'payments_count', COALESCE(json_array_length(pd.items), 0),
    'deliveries', COALESCE(dd.items, '[]'::json),
    'bills_due', COALESCE(bd.items, '[]'::json),
    'rfqs_closing', COALESCE(rd.items, '[]'::json),
    'payments', COALESCE(pd.items, '[]'::json)
  ) ORDER BY ds.d)
  INTO v_days
  FROM day_series ds
  LEFT JOIN delivery_details dd ON dd.d = ds.d
  LEFT JOIN bill_details bd ON bd.d = ds.d
  LEFT JOIN rfq_details rd ON rd.d = ds.d
  LEFT JOIN payment_details pd ON pd.d = ds.d;

  RETURN json_build_object('days', COALESCE(v_days, '[]'::json), 'next_imminent', next_imminent);
END;
$function$;