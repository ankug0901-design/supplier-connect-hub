-- Preserve both existing function bodies and permissions; only qualify object
-- references and remove caller-controlled search-path resolution.
DO $migration$
DECLARE
  signature text;
  definition text;
  relation_name text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.po_tracker_manage(jsonb)',
    'public._po_recalc_status(uuid)'
  ] LOOP
    definition := pg_catalog.pg_get_functiondef(signature::regprocedure);
    FOREACH relation_name IN ARRAY ARRAY[
      'client_orders', 'purchase_orders', 'suppliers', 'po_items',
      'po_production_updates', 'po_dispatch'
    ] LOOP
      definition := pg_catalog.regexp_replace(
        definition,
        '(FROM|JOIN|UPDATE|INTO)([[:space:]]+)' || relation_name || '\M',
        '\1\2public.' || relation_name,
        'g'
      );
    END LOOP;
    definition := pg_catalog.replace(definition, 'PERFORM _po_recalc_status(', 'PERFORM public._po_recalc_status(');
    definition := pg_catalog.replace(definition, ':= track_client_order(', ':= public.track_client_order(');
    EXECUTE definition;
  END LOOP;
END;
$migration$;

ALTER FUNCTION public.po_tracker_manage(jsonb) SET search_path = '';
ALTER FUNCTION public._po_recalc_status(uuid) SET search_path = '';