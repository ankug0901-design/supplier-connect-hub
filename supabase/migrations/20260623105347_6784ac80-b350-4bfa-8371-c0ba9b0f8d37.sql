
CREATE OR REPLACE FUNCTION public.notify_new_po_delivery_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire for newly inserted POs not already in a terminal state
  IF NEW.status IS NULL OR NEW.status NOT IN ('closed','cancelled','rejected','completed','void') THEN
    PERFORM net.http_post(
      url := 'https://agrhkarauqxkgyvfthvc.supabase.co/functions/v1/po-delivery-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFncmhrYXJhdXF4a2d5dmZ0aHZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDA0NjgsImV4cCI6MjA4MjQxNjQ2OH0.pF-FPAuOTq4cSKGZ9PTDXSxAORr7CvTfxJMr4s-hKEc'
      ),
      body := jsonb_build_object('po_id', NEW.id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block PO creation if the HTTP call fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_po ON public.purchase_orders;
CREATE TRIGGER trg_notify_new_po
AFTER INSERT ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_po_delivery_reminder();
