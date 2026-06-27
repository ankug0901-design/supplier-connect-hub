
-- Helper: ensure caller may read the supplier's data
CREATE OR REPLACE FUNCTION public._supplier_dash_auth(_supplier_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = _supplier_id AND s.user_id = auth.uid()
  );
$$;

-- 1. supplier_kpis
CREATE OR REPLACE FUNCTION public.supplier_kpis(p_supplier_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  m_start DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  l_start DATE := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE;
  l_end   DATE := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public._supplier_dash_auth(p_supplier_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN json_build_object(
    'total_po_count', (SELECT COUNT(DISTINCT po_number) FROM purchase_orders WHERE supplier_id=p_supplier_id),
    'new_po_this_month', (SELECT COUNT(DISTINCT po_number) FROM purchase_orders WHERE supplier_id=p_supplier_id AND date >= m_start),
    'pending_invoice_po_count', (
      SELECT COUNT(*) FROM purchase_orders po
      WHERE supplier_id=p_supplier_id
        AND LOWER(COALESCE(status,'')) NOT IN ('billed','closed','cancelled','completed')
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.po_id = po.id)
    ),
    'partial_po_count', (
      SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=p_supplier_id AND LOWER(COALESCE(status,'')) = 'partial'
    ),

    'pending_invoice_count', (
      SELECT COUNT(DISTINCT invoice_number) FROM invoices WHERE supplier_id=p_supplier_id AND status='pending'
    ),
    'pending_invoice_amount', COALESCE(public.to_lakhs((
      SELECT SUM(balance) FROM (
        SELECT DISTINCT ON (invoice_number) balance FROM invoices
        WHERE supplier_id=p_supplier_id AND status='pending'
        ORDER BY invoice_number, updated_at DESC NULLS LAST
      ) x
    )), 0),
    'aging_0_30', (SELECT COUNT(DISTINCT invoice_number) FROM invoices WHERE supplier_id=p_supplier_id AND status='pending' AND (CURRENT_DATE - COALESCE(date, created_at::date)) BETWEEN 0 AND 30),
    'aging_31_60', (SELECT COUNT(DISTINCT invoice_number) FROM invoices WHERE supplier_id=p_supplier_id AND status='pending' AND (CURRENT_DATE - COALESCE(date, created_at::date)) BETWEEN 31 AND 60),
    'aging_60_plus', (SELECT COUNT(DISTINCT invoice_number) FROM invoices WHERE supplier_id=p_supplier_id AND status='pending' AND (CURRENT_DATE - COALESCE(date, created_at::date)) > 60),

    'paid_this_month', COALESCE(public.to_lakhs((
      SELECT SUM(p.amount) FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.supplier_id = p_supplier_id AND p.date >= m_start
    )), 0),
    'paid_last_month', COALESCE(public.to_lakhs((
      SELECT SUM(p.amount) FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.supplier_id = p_supplier_id AND p.date BETWEEN l_start AND l_end
    )), 0),
    'avg_days_to_pay', COALESCE(ROUND((
      SELECT AVG(p.date - i.date) FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.supplier_id = p_supplier_id AND p.date >= CURRENT_DATE - INTERVAL '90 days' AND i.date IS NOT NULL
    )::numeric, 0), 0),

    'total_outstanding', COALESCE(public.to_lakhs((
      SELECT SUM(balance) FROM (
        SELECT DISTINCT ON (invoice_number) balance FROM invoices
        WHERE supplier_id=p_supplier_id AND (balance > 0 OR status='pending')
        ORDER BY invoice_number, updated_at DESC NULLS LAST
      ) x
    )), 0),
    'outstanding_invoice_count', (
      SELECT COUNT(DISTINCT invoice_number) FROM invoices
      WHERE supplier_id=p_supplier_id AND (balance > 0 OR status='pending')
    ),
    'outstanding_invoice_count_last_month', (
      SELECT COUNT(DISTINCT invoice_number) FROM invoices
      WHERE supplier_id=p_supplier_id AND (balance > 0 OR status='pending')
        AND COALESCE(date, created_at::date) < m_start
    ),
    'oldest_outstanding_days', COALESCE((
      SELECT MAX(CURRENT_DATE - COALESCE(date, created_at::date)) FROM invoices
      WHERE supplier_id=p_supplier_id AND (balance > 0 OR status='pending')
    ), 0),

    -- 6-month trend arrays
    'po_count_trend', COALESCE((
      SELECT json_agg(c ORDER BY m)
      FROM (
        SELECT DATE_TRUNC('month', CURRENT_DATE - (n||' months')::interval)::date m,
          (SELECT COUNT(DISTINCT po_number) FROM purchase_orders
            WHERE supplier_id=p_supplier_id
              AND date >= DATE_TRUNC('month', CURRENT_DATE - (n||' months')::interval)::date
              AND date <  DATE_TRUNC('month', CURRENT_DATE - (n||' months')::interval)::date + INTERVAL '1 month'
          ) c
        FROM generate_series(5,0,-1) n
      ) t
    ), '[]'::json),
    'paid_trend', COALESCE((
      SELECT json_agg(c ORDER BY m)
      FROM (
        SELECT DATE_TRUNC('month', CURRENT_DATE - (n||' months')::interval)::date m,
          COALESCE(public.to_lakhs((
            SELECT SUM(p.amount) FROM payments p JOIN invoices i ON i.id=p.invoice_id
            WHERE i.supplier_id=p_supplier_id
              AND p.date >= DATE_TRUNC('month', CURRENT_DATE - (n||' months')::interval)::date
              AND p.date <  DATE_TRUNC('month', CURRENT_DATE - (n||' months')::interval)::date + INTERVAL '1 month'
          )), 0) c
        FROM generate_series(5,0,-1) n
      ) t
    ), '[]'::json),
    'receivables_trend', COALESCE((
      SELECT json_agg(c ORDER BY m)
      FROM (
        SELECT DATE_TRUNC('month', CURRENT_DATE - (n||' months')::interval)::date m,
          COALESCE(public.to_lakhs((
            SELECT SUM(balance) FROM (
              SELECT DISTINCT ON (invoice_number) balance, date, created_at, status FROM invoices
              WHERE supplier_id=p_supplier_id
              ORDER BY invoice_number, updated_at DESC NULLS LAST
            ) x
            WHERE COALESCE(date, created_at::date) < DATE_TRUNC('month', CURRENT_DATE - (n||' months')::interval)::date + INTERVAL '1 month'
              AND status='pending'
          )), 0) c
        FROM generate_series(5,0,-1) n
      ) t
    ), '[]'::json)
  );
END;
$$;

-- 2. attention counts
CREATE OR REPLACE FUNCTION public.supplier_attention_counts(p_supplier_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  week_start DATE := DATE_TRUNC('week', CURRENT_DATE)::DATE;
  week_end DATE := week_start + INTERVAL '6 days';
BEGIN
  IF NOT public._supplier_dash_auth(p_supplier_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN json_build_object(
    'pos_awaiting_invoice', (
      SELECT COUNT(*) FROM purchase_orders po
      WHERE supplier_id=p_supplier_id
        AND LOWER(COALESCE(status,'')) NOT IN ('billed','closed','cancelled','completed')
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.po_id = po.id)
    ),
    'invoices_overdue', (
      SELECT COUNT(DISTINCT invoice_number) FROM invoices
      WHERE supplier_id=p_supplier_id AND status='pending'
        AND COALESCE(due_date, date + INTERVAL '30 days') < CURRENT_DATE
    ),
    'open_rfqs', (
      SELECT COUNT(*) FROM rfq_portal_requests
      WHERE supplier_id=p_supplier_id AND quote_submitted_at IS NULL
        AND COALESCE(response_deadline, CURRENT_DATE) >= CURRENT_DATE
        AND emboss_decision IS NULL
    ),
    'deliveries_this_week', (
      SELECT COUNT(*) FROM purchase_orders
      WHERE supplier_id=p_supplier_id
        AND expected_delivery BETWEEN week_start AND week_end
        AND (status IS NULL OR LOWER(status) NOT IN ('completed','cancelled','closed'))
    ),
    'new_pos_this_week', (
      SELECT COUNT(DISTINCT po_number) FROM purchase_orders
      WHERE supplier_id=p_supplier_id AND date BETWEEN week_start AND week_end
    )
  );
END;
$$;

-- 3. supplier_velocity (4 stages)
CREATE OR REPLACE FUNCTION public.supplier_velocity(p_supplier_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  inv_turn NUMERIC; inv_turn_prev NUMERIC;
  pay_cycle NUMERIC; pay_cycle_prev NUMERIC;
  deliv_cycle NUMERIC; deliv_cycle_prev NUMERIC;
  ontime_pct NUMERIC; ontime_prev_pct NUMERIC;
  in_flight_inv INT; awaiting_pay INT; delivered_cnt INT;
BEGIN
  IF NOT public._supplier_dash_auth(p_supplier_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i.created_at - po.created_at))/86400.0)
  INTO inv_turn FROM invoices i JOIN purchase_orders po ON po.id = i.po_id
  WHERE i.supplier_id = p_supplier_id AND i.created_at >= NOW() - INTERVAL '30 days';

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i.created_at - po.created_at))/86400.0)
  INTO inv_turn_prev FROM invoices i JOIN purchase_orders po ON po.id = i.po_id
  WHERE i.supplier_id = p_supplier_id AND i.created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days';

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (payment_date - date))
  INTO pay_cycle FROM invoices
  WHERE supplier_id = p_supplier_id AND status='paid' AND payment_date >= CURRENT_DATE - INTERVAL '30 days' AND date IS NOT NULL;

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (payment_date - date))
  INTO pay_cycle_prev FROM invoices
  WHERE supplier_id = p_supplier_id AND status='paid' AND payment_date BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '30 days' AND date IS NOT NULL;

  -- Delivery cycle: PO date → expected_delivery captured (use actual challan date when available)
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (dc.created_at - po.created_at))/86400.0)
  INTO deliv_cycle FROM delivery_challans dc JOIN purchase_orders po ON po.id = dc.po_id
  WHERE dc.supplier_id = p_supplier_id AND dc.created_at >= NOW() - INTERVAL '30 days';

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (dc.created_at - po.created_at))/86400.0)
  INTO deliv_cycle_prev FROM delivery_challans dc JOIN purchase_orders po ON po.id = dc.po_id
  WHERE dc.supplier_id = p_supplier_id AND dc.created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days';

  -- On-time delivery from po_items confirmed_delivery_date vs expected_delivery
  SELECT
    ROUND(100.0 * COUNT(*) FILTER (WHERE pi.confirmed_delivery_date IS NOT NULL AND pi.confirmed_delivery_date <= po.expected_delivery) / NULLIF(COUNT(*) FILTER (WHERE pi.confirmed_delivery_date IS NOT NULL), 0), 1)
  INTO ontime_pct
  FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
  WHERE po.supplier_id = p_supplier_id AND pi.confirmed_at >= NOW() - INTERVAL '30 days' AND po.expected_delivery IS NOT NULL;

  SELECT
    ROUND(100.0 * COUNT(*) FILTER (WHERE pi.confirmed_delivery_date IS NOT NULL AND pi.confirmed_delivery_date <= po.expected_delivery) / NULLIF(COUNT(*) FILTER (WHERE pi.confirmed_delivery_date IS NOT NULL), 0), 1)
  INTO ontime_prev_pct
  FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
  WHERE po.supplier_id = p_supplier_id AND pi.confirmed_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' AND po.expected_delivery IS NOT NULL;

  SELECT COUNT(*) INTO in_flight_inv FROM purchase_orders po
    WHERE po.supplier_id = p_supplier_id
      AND (po.status IS NULL OR LOWER(po.status) NOT IN ('completed','closed','cancelled'))
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.po_id = po.id);

  SELECT COUNT(DISTINCT invoice_number) INTO awaiting_pay FROM invoices
    WHERE supplier_id=p_supplier_id AND (balance > 0 OR status='pending');

  SELECT COUNT(*) INTO delivered_cnt FROM delivery_challans
    WHERE supplier_id=p_supplier_id AND created_at >= NOW() - INTERVAL '30 days';

  RETURN json_build_object(
    'stages', json_build_array(
      json_build_object('name','PO → Invoice','median_days',COALESCE(ROUND(inv_turn,1),0),'in_flight',in_flight_inv,
        'delta_days',COALESCE(ROUND(inv_turn - inv_turn_prev,1),0)),
      json_build_object('name','Invoice → Paid','median_days',COALESCE(ROUND(pay_cycle,1),0),'in_flight',awaiting_pay,
        'delta_days',COALESCE(ROUND(pay_cycle - pay_cycle_prev,1),0)),
      json_build_object('name','Delivery Cycle','median_days',COALESCE(ROUND(deliv_cycle,1),0),'in_flight',delivered_cnt,
        'delta_days',COALESCE(ROUND(deliv_cycle - deliv_cycle_prev,1),0))
    ),
    'on_time_delivery_pct', COALESCE(ontime_pct, 0),
    'on_time_delta', ROUND(COALESCE(ontime_pct,0) - COALESCE(ontime_prev_pct,0), 1),
    'total_cycle_days', ROUND(COALESCE(inv_turn,0) + COALESCE(pay_cycle,0) + COALESCE(deliv_cycle,0), 1)
  );
END;
$$;

-- 4. receivables aging (amounts in lakhs)
CREATE OR REPLACE FUNCTION public.supplier_receivables_aging(p_supplier_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public._supplier_dash_auth(p_supplier_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (
    WITH dedup AS (
      SELECT DISTINCT ON (invoice_number) invoice_number, balance, date, created_at
      FROM invoices WHERE supplier_id=p_supplier_id AND (balance > 0 OR status='pending')
      ORDER BY invoice_number, updated_at DESC NULLS LAST
    )
    SELECT json_build_object(
      'amount_0_30', COALESCE(public.to_lakhs(SUM(balance) FILTER (WHERE (CURRENT_DATE - COALESCE(date, created_at::date)) BETWEEN 0 AND 30)), 0),
      'amount_31_60', COALESCE(public.to_lakhs(SUM(balance) FILTER (WHERE (CURRENT_DATE - COALESCE(date, created_at::date)) BETWEEN 31 AND 60)), 0),
      'amount_60_plus', COALESCE(public.to_lakhs(SUM(balance) FILTER (WHERE (CURRENT_DATE - COALESCE(date, created_at::date)) > 60)), 0),
      'total', COALESCE(public.to_lakhs(SUM(balance)), 0)
    ) FROM dedup
  );
END;
$$;

-- 5. active RFQs
CREATE OR REPLACE FUNCTION public.supplier_active_rfqs(p_supplier_id uuid, p_limit int DEFAULT 5)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  open_count INT; responded_count INT; result JSON;
BEGIN
  IF NOT public._supplier_dash_auth(p_supplier_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) FILTER (WHERE emboss_decision IS NULL),
         COUNT(*) FILTER (WHERE quote_submitted_at IS NOT NULL AND emboss_decision IS NULL)
  INTO open_count, responded_count
  FROM rfq_portal_requests
  WHERE supplier_id = p_supplier_id AND COALESCE(response_deadline, CURRENT_DATE) >= CURRENT_DATE;

  SELECT json_agg(row_to_json(t) ORDER BY t.response_deadline) INTO result FROM (
    SELECT id, rfq_id, product_name, response_deadline,
      ROUND(GREATEST(EXTRACT(EPOCH FROM (response_deadline::timestamp - NOW()))/3600.0, 0)::numeric, 1) AS hours_left,
      quote_submitted_at, total_price, quoted_unit_price
    FROM rfq_portal_requests
    WHERE supplier_id = p_supplier_id
      AND emboss_decision IS NULL
      AND COALESCE(response_deadline, CURRENT_DATE) >= CURRENT_DATE
    ORDER BY response_deadline ASC
    LIMIT p_limit
  ) t;

  RETURN json_build_object(
    'open_count', open_count,
    'responded_count', responded_count,
    'items', COALESCE(result, '[]'::json)
  );
END;
$$;

-- 6. activity feed
CREATE OR REPLACE FUNCTION public.supplier_activity_feed(p_supplier_id uuid, p_limit int DEFAULT 8)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public._supplier_dash_auth(p_supplier_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT 'po_received' AS type,
        'PO/' || po.po_number AS target, po.id::text AS ref_id,
        'New PO ' || po.po_number || ' received · ₹' || ROUND(po.amount/100000.0, 2) || ' L' AS body,
        po.created_at,
        NULL::text AS meta
      FROM purchase_orders po
      WHERE po.supplier_id = p_supplier_id AND po.created_at >= NOW() - INTERVAL '14 days'

      UNION ALL
      SELECT 'invoice_status' AS type,
        i.invoice_number, i.id::text,
        'Invoice ' || i.invoice_number || ' is ' || COALESCE(i.status,'pending'),
        COALESCE(i.updated_at, i.created_at),
        CASE WHEN i.status='paid' THEN '₹' || ROUND(i.amount/100000.0, 2) || ' L' ELSE NULL END
      FROM invoices i
      WHERE i.supplier_id = p_supplier_id AND COALESCE(i.updated_at, i.created_at) >= NOW() - INTERVAL '14 days'

      UNION ALL
      SELECT 'payment_received' AS type,
        p.payment_number, p.id::text,
        'Payment of ₹' || ROUND(p.amount/100000.0, 2) || ' L received from Emboss',
        p.created_at,
        i.invoice_number
      FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.supplier_id = p_supplier_id AND p.date >= CURRENT_DATE - INTERVAL '14 days'

      UNION ALL
      SELECT 'rfq_closing' AS type,
        'RFQ-' || r.rfq_id, r.id::text,
        'RFQ ' || r.rfq_id || ' (' || r.product_name || ') closes ' ||
          TO_CHAR(r.response_deadline, 'DD Mon'),
        COALESCE(r.created_at, NOW()),
        NULL
      FROM rfq_portal_requests r
      WHERE r.supplier_id = p_supplier_id
        AND r.emboss_decision IS NULL
        AND r.response_deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        AND r.quote_submitted_at IS NULL

      UNION ALL
      SELECT 'challan_generated' AS type,
        'DC/' || dc.challan_number, dc.id::text,
        'Delivery challan ' || dc.challan_number || ' generated',
        dc.created_at,
        dc.vehicle_number
      FROM delivery_challans dc
      WHERE dc.supplier_id = p_supplier_id AND dc.created_at >= NOW() - INTERVAL '14 days'

      ORDER BY created_at DESC NULLS LAST
      LIMIT p_limit
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.supplier_kpis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_attention_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_velocity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_receivables_aging(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_active_rfqs(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_activity_feed(uuid, int) TO authenticated;
