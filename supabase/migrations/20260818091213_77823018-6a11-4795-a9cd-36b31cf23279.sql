DROP POLICY IF EXISTS "Suppliers can insert own profile" ON public.suppliers;
CREATE POLICY "Suppliers can insert own profile"
ON public.suppliers FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'supplier'::text);