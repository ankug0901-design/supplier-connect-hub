DO $migration$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.proof_manage(jsonb)'::regprocedure) INTO definition;
  IF position('WHEN ''list_proofs_by_tracking_token'' THEN' IN definition) > 0 THEN
    RAISE EXCEPTION 'Tracking proof action already exists';
  END IF;
  definition := replace(definition, '  CASE v_action', $action$  CASE v_action

  WHEN 'list_proofs_by_tracking_token' THEN
    DECLARE
      v_order_id uuid;
      v_proofs jsonb;
    BEGIN
      IF NULLIF(btrim(payload->>'tracking_token'), '') IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Tracking token required');
      END IF;
      SELECT co.id INTO v_order_id FROM public.client_orders co
      WHERE co.tracking_token = payload->>'tracking_token';
      IF v_order_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Order not found');
      END IF;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pa.id, 'client_order_id', pa.client_order_id, 'item_id', pa.item_id,
        'title', pa.title, 'proof_type', pa.proof_type, 'description', pa.description,
        'status', pa.status, 'revision_number', pa.revision_number,
        'media_urls', pa.media_urls, 'created_at', pa.created_at,
        'client_response_at', pa.client_response_at, 'client_comment', pa.client_comment,
        'approval_token', CASE WHEN pa.status = 'pending' THEN pa.approval_token ELSE NULL END
      ) ORDER BY pa.created_at DESC, pa.id DESC), '[]'::jsonb) INTO v_proofs
      FROM public.proof_approvals pa WHERE pa.client_order_id = v_order_id;
      v_result := jsonb_build_object('ok', true, 'proofs', v_proofs);
    END;
$action$);
  EXECUTE definition;
END;
$migration$;