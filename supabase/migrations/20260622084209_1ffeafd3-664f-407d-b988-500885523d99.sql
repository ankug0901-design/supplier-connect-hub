ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_role_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_role_check CHECK (role IN ('supplier', 'user', 'super_user', 'admin'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_user', 'user')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_section_access(_section_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT ssa.enabled
      FROM public.supplier_section_access ssa
      WHERE ssa.user_id = auth.uid()
        AND ssa.section_key = _section_key
      LIMIT 1
    ),
    (
      SELECT rsa.enabled
      FROM public.suppliers s
      JOIN public.role_section_access rsa ON rsa.role = s.role
      WHERE s.user_id = auth.uid()
        AND rsa.section_key = _section_key
      LIMIT 1
    ),
    false
  );
$$;

DROP POLICY IF EXISTS "Admin full access to rfq_portal_requests" ON public.rfq_portal_requests;
CREATE POLICY "Admins and RFQ users manage rfq_portal_requests"
  ON public.rfq_portal_requests
  FOR ALL
  TO authenticated
  USING (public.is_super_admin() OR public.has_section_access('admin-rfq'))
  WITH CHECK (public.is_super_admin() OR public.has_section_access('admin-rfq'));

DROP POLICY IF EXISTS "Admins manage all section access" ON public.supplier_section_access;
CREATE POLICY "Super admins manage all section access"
  ON public.supplier_section_access
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

UPDATE public.supplier_section_access
SET enabled = true
WHERE user_id = 'b83e8310-50dd-4dda-91c6-3d1987cb95bc'
  AND section_key = 'admin-rfq';

INSERT INTO public.supplier_section_access (user_id, section_key, enabled)
VALUES ('b83e8310-50dd-4dda-91c6-3d1987cb95bc', 'admin-rfq', true)
ON CONFLICT (user_id, section_key) DO UPDATE SET enabled = EXCLUDED.enabled;

DELETE FROM public.supplier_section_access
WHERE user_id = 'b83e8310-50dd-4dda-91c6-3d1987cb95bc'
  AND section_key = 'rfq-requests';