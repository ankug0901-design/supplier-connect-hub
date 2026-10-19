ALTER TABLE public.payments ADD COLUMN supplier_notified_at timestamptz;
COMMENT ON COLUMN public.payments.supplier_notified_at IS 'Completion marker for supplier payment notifications; existing payments are baselined to prevent historical mailouts.';
UPDATE public.payments SET supplier_notified_at = now();
DROP TRIGGER IF EXISTS trg_notify_new_po ON public.purchase_orders;
CREATE TRIGGER trg_notify_new_po AFTER INSERT OR UPDATE OF status ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.notify_new_po_delivery_reminder();