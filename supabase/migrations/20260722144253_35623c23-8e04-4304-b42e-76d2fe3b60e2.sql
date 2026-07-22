
DELETE FROM public.rfq_item_quotes WHERE supplier_id IS NULL;

CREATE OR REPLACE FUNCTION public.rfq_item_quotes_resolve_supplier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NULL AND NEW.supplier_email IS NOT NULL THEN
    SELECT s.id INTO NEW.supplier_id
    FROM public.suppliers s
    WHERE lower(s.email) = lower(NEW.supplier_email)
    LIMIT 1;
  END IF;
  IF NEW.supplier_id IS NULL THEN
    RAISE EXCEPTION 'rfq_item_quotes.supplier_id could not be resolved for email %', NEW.supplier_email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rfq_item_quotes_resolve_supplier ON public.rfq_item_quotes;
CREATE TRIGGER trg_rfq_item_quotes_resolve_supplier
BEFORE INSERT OR UPDATE ON public.rfq_item_quotes
FOR EACH ROW EXECUTE FUNCTION public.rfq_item_quotes_resolve_supplier();

ALTER TABLE public.rfq_item_quotes
  ALTER COLUMN supplier_id SET NOT NULL;

CREATE POLICY "Admins can view email send state"
ON public.email_send_state
FOR SELECT
TO authenticated
USING (public.is_admin());
