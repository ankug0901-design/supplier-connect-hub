CREATE POLICY "Authenticated can read role section access"
ON public.role_section_access
FOR SELECT
TO authenticated
USING (true);