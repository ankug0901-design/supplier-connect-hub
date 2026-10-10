BEGIN;
-- The query runner has no user session; existing role helpers must deny management.
DO $$
DECLARE result jsonb; action text;
BEGIN
  FOREACH action IN ARRAY ARRAY['create_proof','list_proofs','resubmit_proof','delete_proof','mark_email_sent'] LOOP
    result := public.proof_manage(jsonb_build_object('action', action));
    IF result->>'error' IS DISTINCT FROM 'Admin access required' THEN RAISE EXCEPTION 'Anonymous management action allowed: %', action; END IF;
  END LOOP;
  result := public.proof_manage('{"action":"get_proof_by_token","approval_token":""}');
  IF result->>'error' IS DISTINCT FROM 'Review token required' THEN RAISE EXCEPTION 'Empty review token allowed'; END IF;
  result := public.proof_manage('{"action":"request_revision","approval_token":"test-token","comment":"  "}');
  IF result->>'error' IS DISTINCT FROM 'Please describe the changes needed' THEN RAISE EXCEPTION 'Empty revision comment allowed'; END IF;
END;
$$;
ROLLBACK;