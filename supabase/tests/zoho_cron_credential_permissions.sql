DO $$
BEGIN
  IF has_function_privilege('anon', 'public.refresh_zoho_cron_credential(text)', 'execute') THEN
    RAISE EXCEPTION 'Anonymous callers must not refresh scheduled credentials';
  END IF;
  IF has_function_privilege('authenticated', 'public.refresh_zoho_cron_credential(text)', 'execute') THEN
    RAISE EXCEPTION 'User sessions must not refresh scheduled credentials';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.refresh_zoho_cron_credential(text)', 'execute') THEN
    RAISE EXCEPTION 'The live service-role binding must be allowed to refresh scheduled credentials';
  END IF;
END;
$$;