
DROP POLICY IF EXISTS "Authenticated can read role section access" ON public.role_section_access;
DROP POLICY IF EXISTS "Users can read their own role section access" ON public.role_section_access;

CREATE POLICY "Users can read own role section access"
ON public.role_section_access
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR role = (SELECT s.role FROM public.suppliers s WHERE s.user_id = auth.uid() LIMIT 1)
);
