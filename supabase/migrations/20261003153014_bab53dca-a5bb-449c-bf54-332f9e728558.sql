ALTER TABLE public.po_dispatch
ADD CONSTRAINT po_dispatch_po_id_lr_number_key UNIQUE (po_id, lr_number);