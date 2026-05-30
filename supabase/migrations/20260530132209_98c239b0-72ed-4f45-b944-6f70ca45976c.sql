ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_role_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_role_check CHECK (role IN ('supplier', 'super_user', 'admin'));