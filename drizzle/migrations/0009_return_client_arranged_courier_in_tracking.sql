-- track_by_token delegates to public.track_client_order; expose the client-arranged-courier flag
-- so the public tracking page can hide courier tracking and trim the progress stepper.
CREATE OR REPLACE FUNCTION public.track_client_order(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order RECORD;
  v_result JSONB;
  v_items JSONB;
  v_updates JSONB;
  v_dispatch JSONB;
BEGIN
  SELECT * INTO v_order FROM public.client_orders WHERE tracking_token = p_token;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Order not found');
  END IF;

  -- Auto-fix status if dispatch records exist
  PERFORM public._po_recalc_status(v_order.id);

  -- Reload order after recalc
  SELECT * INTO v_order FROM public.client_orders WHERE id = v_order.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', pi.id, 'item_name', COALESCE(pi.item_name, pi.description),
    'quantity', pi.quantity, 'current_stage', pi.current_stage,
    'completed_stages', pi.completed_stages, 'production_stages', pi.production_stages,
    'po_id', po.id, 'po_number', po.po_number, 'supplier_name', s.company,
    'delivery_locations', pi.delivery_locations
  ) ORDER BY pi.created_at), '[]'::jsonb) INTO v_items
  FROM public.po_items pi
  JOIN public.purchase_orders po ON po.id = pi.po_id
  JOIN public.suppliers s ON s.id = po.supplier_id
  WHERE po.client_order_id = v_order.id;

  -- Deduplicate: show only the latest update per (item_id, stage, status)
  -- so in_progress and completed for the same stage both appear,
  -- but multiple entries with the same stage+status are collapsed
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pu.id, 'stage', pu.stage, 'status', pu.status,
    'note', pu.note, 'media_urls', pu.media_urls,
    'created_at', pu.created_at
  ) ORDER BY pu.created_at DESC), '[]'::jsonb) INTO v_updates
  FROM (
    SELECT DISTINCT ON (COALESCE(item_id::text, ''), stage, status) *
    FROM public.po_production_updates
    WHERE client_order_id = v_order.id
    ORDER BY COALESCE(item_id::text, ''), stage, status, created_at DESC
  ) pu;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id, 'po_id', d.po_id, 'item_id', d.item_id,
    'vehicle_number', d.vehicle_number, 'transporter_name', d.transporter_name,
    'lr_number', d.lr_number, 'dispatch_date', d.dispatch_date,
    'expected_arrival', d.expected_arrival, 'actual_delivery_date', d.actual_delivery_date,
    'delivery_status', d.delivery_status, 'vehicle_photo_url', d.vehicle_photo_url,
    'delivery_proof_urls', d.delivery_proof_urls,
    'courier_name', d.courier_name, 'awb_number', d.awb_number,
    'dispatch_quantity', d.dispatch_quantity, 'notes', d.notes,
    'driver_name', d.driver_name, 'driver_phone', d.driver_phone
  ) ORDER BY d.dispatch_date DESC NULLS LAST), '[]'::jsonb) INTO v_dispatch
  FROM public.po_dispatch d WHERE d.client_order_id = v_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'id', v_order.id, 'order_number', v_order.order_number,
      'client_name', v_order.client_name, 'order_date', v_order.order_date,
      'expected_delivery', v_order.expected_delivery,
      'overall_status', v_order.overall_status, 'created_at', v_order.created_at,
      'client_arranged_courier', v_order.client_arranged_courier
    ),
    'items', v_items,
    'production_updates', v_updates,
    'dispatch', v_dispatch
  );
END;
$function$;