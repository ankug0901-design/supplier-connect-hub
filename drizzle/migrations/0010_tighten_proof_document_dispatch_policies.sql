DROP POLICY IF EXISTS "Authenticated users can manage proof_approvals" ON public.proof_approvals;
CREATE POLICY "Admins manage proof_approvals" ON public.proof_approvals FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_tracker_admin()) WITH CHECK (public.is_admin() OR public.is_tracker_admin());

DROP POLICY IF EXISTS "Allow authenticated full access on order_documents" ON public.order_documents;
DROP POLICY IF EXISTS "Allow anon read via RPC on order_documents" ON public.order_documents;
CREATE POLICY "Admins manage order_documents" ON public.order_documents FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_tracker_admin()) WITH CHECK (public.is_admin() OR public.is_tracker_admin());

DROP POLICY IF EXISTS "Allow anon insert dispatch" ON public.po_dispatch;
DROP POLICY IF EXISTS "Allow anon update dispatch" ON public.po_dispatch;
DROP POLICY IF EXISTS "Allow anon select dispatch" ON public.po_dispatch;
CREATE POLICY "Tracker admins manage dispatch" ON public.po_dispatch FOR ALL TO authenticated
  USING (public.is_tracker_admin()) WITH CHECK (public.is_tracker_admin());