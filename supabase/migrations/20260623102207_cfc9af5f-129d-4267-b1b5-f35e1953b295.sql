DELETE FROM public.invoice_line_items ili
WHERE ili.supplier_id = '07626d70-68d7-4f9e-9d88-386ba384b50a'
  AND ili.po_number = 'EM/PO/26-27/038'
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.supplier_id = ili.supplier_id
      AND i.invoice_number = ili.invoice_number
  );