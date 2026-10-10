BEGIN;
DO $$
DECLARE
  order_a uuid := gen_random_uuid(); order_b uuid := gen_random_uuid();
  token_a text := gen_random_uuid()::text; token_b text := gen_random_uuid()::text;
  proof_a uuid := gen_random_uuid(); proof_b uuid := gen_random_uuid();
  result jsonb;
BEGIN
  INSERT INTO public.client_orders(id, order_number, client_name, tracking_token)
  VALUES (order_a, 'test-' || order_a, 'Test A', token_a), (order_b, 'test-' || order_b, 'Test B', token_b);
  INSERT INTO public.proof_approvals(id, client_order_id, title, proof_type)
  VALUES (proof_a, order_a, 'Test A', 'artwork'), (proof_b, order_b, 'Test B', 'artwork');
  result := public.proof_manage(jsonb_build_object('action', 'list_proofs_by_tracking_token', 'tracking_token', token_a, 'client_order_id', order_b));
  IF jsonb_array_length(result->'proofs') <> 1 OR result->'proofs'->0->>'id' IS DISTINCT FROM proof_a::text THEN
    RAISE EXCEPTION 'Tracking token leaked another order proofs';
  END IF;
  IF (result->'proofs'->0) ? 'email_recipient' OR (result->'proofs'->0) ? 'email_sent_at' THEN
    RAISE EXCEPTION 'Admin email data leaked';
  END IF;
  result := public.proof_manage('{"action":"list_proofs_by_tracking_token","tracking_token":""}');
  IF result->>'error' IS DISTINCT FROM 'Tracking token required' THEN RAISE EXCEPTION 'Empty token allowed'; END IF;
  result := public.proof_manage(jsonb_build_object('action', 'list_proofs_by_tracking_token', 'tracking_token', gen_random_uuid()::text));
  IF result->>'error' IS DISTINCT FROM 'Order not found' THEN RAISE EXCEPTION 'Invalid token allowed'; END IF;
END;
$$;
ROLLBACK;