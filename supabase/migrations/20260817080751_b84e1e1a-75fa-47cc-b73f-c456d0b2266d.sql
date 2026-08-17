ALTER TABLE public.invoices ALTER COLUMN po_id DROP NOT NULL;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_role_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_role_check CHECK (role IN ('supplier','user','super_user','admin','tracker_admin'));