
-- Hide unapproved Zoho POs from supplier view.
-- Only POs whose Zoho status indicates the PO has been approved/issued
-- (or later reached billed/closed/cancelled/completed) are visible to the
-- supplier who owns them. Admins keep full visibility via the existing
-- "Admin full access to POs" policy.

DROP POLICY IF EXISTS "Suppliers can view own POs" ON public.purchase_orders;

CREATE POLICY "Suppliers can view own POs"
  ON public.purchase_orders
  FOR SELECT
  TO authenticated
  USING (
    supplier_id IN (
      SELECT id FROM public.suppliers WHERE user_id = auth.uid()
    )
    AND COALESCE(lower(status), '') NOT IN (
      'draft',
      'pending',
      'pending_approval',
      'rejected'
    )
  );

-- Skip PO-delivery reminder emails for POs that are not yet approved.
CREATE OR REPLACE FUNCTION public.notify_new_po_delivery_reminder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_service_key text;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN (
    'draft','pending','pending_approval','rejected',
    'closed','cancelled','completed','void'
  ) THEN
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
