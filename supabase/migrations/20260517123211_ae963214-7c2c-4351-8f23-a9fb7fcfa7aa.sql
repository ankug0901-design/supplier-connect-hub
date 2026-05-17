
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS zoho_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS zoho_id text;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_supplier_po_uniq
  ON public.purchase_orders (supplier_id, po_number);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_supplier_invoice_uniq
  ON public.invoices (supplier_id, invoice_number);

CREATE UNIQUE INDEX IF NOT EXISTS payments_invoice_txn_uniq
  ON public.payments (invoice_id, transaction_id);
