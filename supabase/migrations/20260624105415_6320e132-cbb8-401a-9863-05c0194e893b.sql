
-- Reschedule the daily PO delivery reminder cron to authenticate with the
-- service-role key from vault (matches process-email-queue pattern).
SELECT cron.unschedule('po-delivery-reminder-daily');
SELECT cron.schedule(
  'po-delivery-reminder-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://agrhkarauqxkgyvfthvc.supabase.co/functions/v1/po-delivery-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Update the new-PO trigger to call the function with the service-role bearer token
CREATE OR REPLACE FUNCTION public.notify_new_po_delivery_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_service_key text;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('closed','cancelled','rejected','completed','void') THEN
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets
      WHERE name = 'email_queue_service_role_key';
    IF v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://agrhkarauqxkgyvfthvc.supabase.co/functions/v1/po-delivery-reminder',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object('po_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;
