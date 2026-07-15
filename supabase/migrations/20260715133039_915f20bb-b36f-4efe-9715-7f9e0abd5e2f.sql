
-- Fix: suppliers see empty sidebar because role_section_access was locked to admins.
-- This table only holds page-visibility config; every signed-in user needs to read
-- their own role's rows to know which nav sections to render.
DROP POLICY IF EXISTS "Admins read role section access" ON public.role_section_access;
CREATE POLICY "Authenticated can read role section access" ON public.role_section_access
  FOR SELECT TO authenticated
  USING (true);

-- Fix: non-admin RFQ managers lost supplier company lookup on /admin/rfq.
-- Restore the previous policy that allowed users with admin-rfq section access
-- to read the supplier directory.
DROP POLICY IF EXISTS "RFQ managers can read supplier directory" ON public.suppliers;
CREATE POLICY "RFQ managers can read supplier directory" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.has_section_access('admin-rfq'));
