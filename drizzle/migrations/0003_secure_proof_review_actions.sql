DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.proof_manage(jsonb)'::regprocedure) INTO definition;
  definition := replace(definition, 'SET search_path TO ''public''', 'SET search_path TO ''''');
  definition := replace(definition, '  CASE v_action', $guard$
  IF v_action IN ('create_proof', 'list_proofs', 'resubmit_proof', 'delete_proof', 'mark_email_sent')
     AND NOT (COALESCE(public.is_admin(), false) OR COALESCE(public.is_tracker_admin(), false)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  IF v_action IN ('get_proof_by_token', 'approve_proof', 'request_revision')
     AND NULLIF(btrim(payload->>'approval_token'), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Review token required');
  END IF;
  IF v_action = 'request_revision' AND NULLIF(btrim(payload->>'comment'), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please describe the changes needed');
  END IF;
  CASE v_action$guard$);
  definition := replace(definition, 'CASE WHEN v_item.id IS NOT NULL', 'CASE WHEN v_proof.item_id IS NOT NULL');
  definition := replace(definition, 'WHERE id = (payload->>''proof_id'')::uuid;', 'WHERE id = (payload->>''proof_id'')::uuid AND status = ''revision_requested'';');
  EXECUTE definition;
END;
$migration$;
GRANT EXECUTE ON FUNCTION public.proof_manage(jsonb) TO anon, authenticated, service_role;