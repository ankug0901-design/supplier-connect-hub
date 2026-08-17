
-- Guard: invoices — suppliers may not alter financial fields
CREATE OR REPLACE FUNCTION public.guard_invoice_supplier_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     OR NEW.po_id IS DISTINCT FROM OLD.po_id
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.balance IS DISTINCT FROM OLD.balance
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
     OR NEW.zoho_id IS DISTINCT FROM OLD.zoho_id
  THEN
    RAISE EXCEPTION 'Suppliers cannot modify invoice financial or identifying fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_invoice_supplier_update ON public.invoices;
CREATE TRIGGER guard_invoice_supplier_update
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_supplier_update();

-- Guard: invoice_line_items — suppliers may not alter billing fields
CREATE OR REPLACE FUNCTION public.guard_invoice_line_item_supplier_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.po_number IS DISTINCT FROM OLD.po_number
     OR NEW.item_name IS DISTINCT FROM OLD.item_name
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.rate IS DISTINCT FROM OLD.rate
  THEN
    RAISE EXCEPTION 'Suppliers cannot modify invoice line item billing fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_invoice_line_item_supplier_update ON public.invoice_line_items;
CREATE TRIGGER guard_invoice_line_item_supplier_update
BEFORE UPDATE ON public.invoice_line_items
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_line_item_supplier_update();

-- Guard: po_items — suppliers may not alter commercial terms
CREATE OR REPLACE FUNCTION public.guard_po_item_supplier_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() OR public.is_tracker_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.po_id IS DISTINCT FROM OLD.po_id
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.item_name IS DISTINCT FROM OLD.item_name
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.hsn IS DISTINCT FROM OLD.hsn
     OR NEW.tax_percentage IS DISTINCT FROM OLD.tax_percentage
     OR NEW.tax_name IS DISTINCT FROM OLD.tax_name
     OR NEW.zoho_line_item_id IS DISTINCT FROM OLD.zoho_line_item_id
  THEN
    RAISE EXCEPTION 'Suppliers cannot modify purchase order line item commercial terms';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_po_item_supplier_update ON public.po_items;
CREATE TRIGGER guard_po_item_supplier_update
BEFORE UPDATE ON public.po_items
FOR EACH ROW EXECUTE FUNCTION public.guard_po_item_supplier_update();
