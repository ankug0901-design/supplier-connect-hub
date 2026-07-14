
-- Restrict app_roles reads to admins
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.app_roles;
CREATE POLICY "Admins view roles" ON public.app_roles
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Restrict role_section_access reads to admins
DROP POLICY IF EXISTS "Authenticated can read role section access" ON public.role_section_access;
CREATE POLICY "Admins read role section access" ON public.role_section_access
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Harden rfq_items supplier read: use resolved supplier_id, not email string match
DROP POLICY IF EXISTS "Suppliers view items for their RFQs" ON public.rfq_items;
CREATE POLICY "Suppliers view items for their RFQs" ON public.rfq_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.rfq_portal_requests r
    JOIN public.suppliers s ON s.id = r.supplier_id
    WHERE r.rfq_id = rfq_items.rfq_id
      AND s.user_id = auth.uid()
  ));
