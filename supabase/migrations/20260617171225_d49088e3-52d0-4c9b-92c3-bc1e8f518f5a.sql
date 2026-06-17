GRANT SELECT ON public.email_send_log TO authenticated;
CREATE POLICY "Admins can read send log" ON public.email_send_log FOR SELECT TO authenticated USING (public.is_admin());