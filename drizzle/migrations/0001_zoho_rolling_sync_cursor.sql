CREATE TABLE public.sync_cursor (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 next_offset integer NOT NULL DEFAULT 0 CHECK (next_offset >= 0),
 lease_token uuid,
 lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sync_cursor TO service_role;
REVOKE ALL ON public.sync_cursor FROM anon, authenticated;
ALTER TABLE public.sync_cursor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages sync cursor" ON public.sync_cursor FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.claim_zoho_sync_cursor()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed public.sync_cursor; new_token uuid := gen_random_uuid();
BEGIN
 INSERT INTO public.sync_cursor(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
 UPDATE public.sync_cursor SET lease_token = new_token, lease_until = now() + interval '3 minutes'
 WHERE id = 1 AND (lease_until IS NULL OR lease_until < now()) RETURNING * INTO claimed;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('offset', claimed.next_offset, 'lease_token', new_token);
END; $$;
CREATE OR REPLACE FUNCTION public.complete_zoho_sync_cursor(p_token uuid, p_next_offset integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF p_next_offset < 0 THEN RAISE EXCEPTION 'Invalid cursor offset'; END IF;
 UPDATE public.sync_cursor SET next_offset = p_next_offset, lease_token = NULL, lease_until = NULL, updated_at = now()
 WHERE id = 1 AND lease_token = p_token;
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.claim_zoho_sync_cursor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_zoho_sync_cursor(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_zoho_sync_cursor(), public.complete_zoho_sync_cursor(uuid,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.refresh_zoho_cron_credential(runtime_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE secret_id uuid;
BEGIN
 IF runtime_key IS NULL OR length(runtime_key) < 32 THEN RAISE EXCEPTION 'Missing runtime credential'; END IF;
 SELECT id INTO secret_id FROM vault.secrets WHERE name = 'zoho_sync_service_role_key';
 IF secret_id IS NULL THEN
  PERFORM vault.create_secret(runtime_key, 'zoho_sync_service_role_key', 'Zoho scheduled sync runtime credential');
 ELSE
  PERFORM vault.update_secret(secret_id, runtime_key);
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_zoho_cron_credential(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_zoho_cron_credential(text) TO service_role;