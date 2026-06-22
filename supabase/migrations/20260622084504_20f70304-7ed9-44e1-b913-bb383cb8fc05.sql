CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_user')
  );
$$;

DROP POLICY IF EXISTS "RFQ managers can read supplier directory" ON public.suppliers;
CREATE POLICY "RFQ managers can read supplier directory"
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (public.has_section_access('admin-rfq'));

INSERT INTO public.role_section_access (role, section_key, enabled) VALUES
  ('user', 'admin-exception-requests', false),
  ('super_user', 'admin-exception-requests', true)
ON CONFLICT (role, section_key) DO UPDATE SET enabled = EXCLUDED.enabled;

INSERT INTO public.supplier_section_access (user_id, section_key, enabled)
VALUES ('b83e8310-50dd-4dda-91c6-3d1987cb95bc', 'admin-exception-requests', false)
ON CONFLICT (user_id, section_key) DO UPDATE SET enabled = EXCLUDED.enabled;