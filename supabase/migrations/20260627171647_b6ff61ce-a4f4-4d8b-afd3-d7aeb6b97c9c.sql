
CREATE OR REPLACE FUNCTION public.supplier_kpis(p_supplier_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  m_start DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  l_start DATE := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE;
  l_end   DATE := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::DATE;
  v_pending_po_cnt INT;
  v_partial_po_cnt INT;
  v_total_recv NUMERIC;
  v_total_recv_last NUMERIC;
  v_recv_cnt INT;
  v_recv_cnt_last INT;
  v_oldest_days INT;
BEGIN
  IF NOT public._supplier_dash_auth(p_supplier_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_pending_po_cnt FROM purchase_orders po
    WHERE supplier_id=p_supplier_id
      AND LOWER(COALESCE(status,'')) NOT IN ('billed','closed','cancelled','completed')
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.po_id = po.id);
  SELECT COUNT(*) INTO v_partial_po_cnt FROM purchase_orders
    WHERE supplier_id=p_supplier_id AND LOWER(COALESCE(status,'')) = 'partial';

  SELECT COALESCE(public.to_lakhs(SUM(balance)),0) INTO v_total_recv FROM (
    SELECT DISTINCT ON (invoice_number) balance FROM invoices
    WHERE supplier_id=p_supplier_id AND (balance>0 OR status='pending')
    ORDER BY invoice_number, updated_at DESC NULLS LAST
  ) x;
  SELECT COALESCE(public.to_lakhs(SUM(balance)),0) INTO v_total_recv_last FROM (
    SELECT DISTINCT ON (invoice_number) balance, date, created_at FROM invoices
    WHERE supplier_id=p_supplier_id AND (balance>0 OR status='pending')
    ORDER BY invoice_number, updated_at DESC NULLS LAST
  ) x WHERE COALESCE(date, created_at::date) < m_start;

  SELECT COUNT(DISTINCT invoice_number) INTO v_recv_cnt FROM invoices
    WHERE supplier_id=p_supplier_id AND (balance>0 OR status='pending');
  SELECT COUNT(DISTINCT invoice_number) INTO v_recv_cnt_last FROM invoices
    WHERE supplier_id=p_supplier_id AND (balance>0 OR status='pending')
      AND COALESCE(date, created_at::date) < m_start;
  SELECT COALESCE(MAX(CURRENT_DATE - COALESCE(date, created_at::date)),0) INTO v_oldest_days
    FROM invoices WHERE supplier_id=p_supplier_id AND (balance>0 OR status='pending');

  RETURN json_build_object(
    'total_po_count', (SELECT COUNT(DISTINCT po_number) FROM purchase_orders WHERE supplier_id=p_supplier_id),
    'new_po_this_month', (SELECT COUNT(DISTINCT po_number) FROM purchase_orders WHERE supplier_id=p_supplier_id AND date >= m_start),

    'pending_invoice_po_count', v_pending_po_cnt,
    'partial_po_count', v_partial_po_cnt,
    'po_pending_invoice_count', v_pending_po_cnt,
    'po_partial_count', v_partial_po_cnt,

    'pending_invoice_count', (SELECT COUNT(DISTINCT invoice_number) FROM invoices WHERE supplier_id=p_supplier_id AND status='pending'),
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

    'total_outstanding', v_total_recv,
    'total_receivables', v_total_recv,
    'total_receivables_last_month', v_total_recv_last,
    'outstanding_invoice_count', v_recv_cnt,
    'receivable_invoice_count', v_recv_cnt,
    'outstanding_invoice_count_last_month', v_recv_cnt_last,
    'receivable_invoice_count_last_month', v_recv_cnt_last,
    'oldest_outstanding_days', v_oldest_days,
    'oldest_receivable_days', v_oldest_days,

    'po_count_trend', COALESCE((
      SELECT json_agg(c ORDER BY m) FROM (
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
      SELECT json_agg(c ORDER BY m) FROM (
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
      SELECT json_agg(c ORDER BY m) FROM (
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

CREATE OR REPLACE FUNCTION public.supplier_velocity(p_supplier_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  inv_turn NUMERIC; inv_turn_prev NUMERIC;
  pay_cycle NUMERIC; pay_cycle_prev NUMERIC;
  deliv_cycle NUMERIC; deliv_cycle_prev NUMERIC;
  ontime_pct NUMERIC; ontime_prev_pct NUMERIC;
  in_flight_inv INT; awaiting_pay INT; delivered_cnt INT;
  ontime_sample INT;
  total_cycle NUMERIC;
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

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (dc.created_at - po.created_at))/86400.0)
  INTO deliv_cycle FROM delivery_challans dc JOIN purchase_orders po ON po.id = dc.po_id
  WHERE dc.supplier_id = p_supplier_id AND dc.created_at >= NOW() - INTERVAL '30 days';

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (dc.created_at - po.created_at))/86400.0)
  INTO deliv_cycle_prev FROM delivery_challans dc JOIN purchase_orders po ON po.id = dc.po_id
  WHERE dc.supplier_id = p_supplier_id AND dc.created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days';

  SELECT
    ROUND(100.0 * COUNT(*) FILTER (WHERE pi.confirmed_delivery_date IS NOT NULL AND pi.confirmed_delivery_date <= po.expected_delivery) / NULLIF(COUNT(*) FILTER (WHERE pi.confirmed_delivery_date IS NOT NULL), 0), 1),
    COUNT(*) FILTER (WHERE pi.confirmed_delivery_date IS NOT NULL)
  INTO ontime_pct, ontime_sample
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

  total_cycle := CASE WHEN inv_turn IS NULL AND pay_cycle IS NULL AND deliv_cycle IS NULL
    THEN NULL
    ELSE ROUND(COALESCE(inv_turn,0) + COALESCE(pay_cycle,0) + COALESCE(deliv_cycle,0), 1)
  END;

  RETURN json_build_object(
    'stages', json_build_array(
      json_build_object('name','PO → Invoice','median_days',COALESCE(ROUND(inv_turn,1),0),'in_flight',in_flight_inv,
        'delta_days',COALESCE(ROUND(inv_turn - inv_turn_prev,1),0),'has_data', inv_turn IS NOT NULL),
      json_build_object('name','Invoice → Paid','median_days',COALESCE(ROUND(pay_cycle,1),0),'in_flight',awaiting_pay,
        'delta_days',COALESCE(ROUND(pay_cycle - pay_cycle_prev,1),0),'has_data', pay_cycle IS NOT NULL),
      json_build_object('name','Delivery Cycle','median_days',COALESCE(ROUND(deliv_cycle,1),0),'in_flight',delivered_cnt,
        'delta_days',COALESCE(ROUND(deliv_cycle - deliv_cycle_prev,1),0),'has_data', deliv_cycle IS NOT NULL)
    ),
    'on_time_delivery_pct', COALESCE(ontime_pct, 0),
    'on_time_delta', ROUND(COALESCE(ontime_pct,0) - COALESCE(ontime_prev_pct,0), 1),
    'on_time_has_data', COALESCE(ontime_sample,0) > 0,
    'total_cycle_days', total_cycle
  );
END;
$$;
