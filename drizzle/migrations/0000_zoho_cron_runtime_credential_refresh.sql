CREATE OR REPLACE FUNCTION public.refresh_zoho_cron_credential(runtime_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret_id uuid;
BEGIN
  IF runtime_key IS NULL OR length(runtime_key) < 32 THEN
    RAISE EXCEPTION 'Missing runtime credential';
  END IF;
  SELECT id INTO secret_id FROM vault.secrets WHERE name = 'email_queue_service_role_key';
  IF secret_id IS NULL THEN
    RAISE EXCEPTION 'Scheduled credential is missing';
  END IF;
  PERFORM vault.update_secret(secret_id, runtime_key);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_zoho_cron_credential(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_zoho_cron_credential(text) TO service_role;