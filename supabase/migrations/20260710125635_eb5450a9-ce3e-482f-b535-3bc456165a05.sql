DROP POLICY IF EXISTS "Admins and RFQ users manage rfq_portal_requests" ON public.rfq_portal_requests;
CREATE POLICY "Admins and RFQ users manage rfq_portal_requests"
ON public.rfq_portal_requests
FOR ALL
TO authenticated
USING (public.is_admin() OR public.has_section_access('admin-rfq'))
WITH CHECK (public.is_admin() OR public.has_section_access('admin-rfq'));