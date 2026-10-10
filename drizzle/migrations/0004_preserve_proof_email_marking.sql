DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.proof_manage(jsonb)'::regprocedure) INTO definition;
  definition := replace(definition, 'WHERE id = (payload->>''proof_id'')::uuid AND status = ''revision_requested'';' || chr(10) || chr(10) || '      v_result := jsonb_build_object(''ok'', true);', 'WHERE id = (payload->>''proof_id'')::uuid;' || chr(10) || chr(10) || '      v_result := jsonb_build_object(''ok'', true);');
  EXECUTE definition;
END;
$migration$;