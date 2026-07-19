
-- 1. Restrict rfq-attachments storage policies to admins for writes, authenticated for reads
DROP POLICY IF EXISTS "rfq_attachments_public_read" ON storage.objects;
DROP POLICY IF EXISTS "rfq_attachments_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "rfq_attachments_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "rfq_attachments_auth_delete" ON storage.objects;

CREATE POLICY "rfq_attachments_auth_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'rfq-attachments');

CREATE POLICY "rfq_attachments_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'rfq-attachments' AND public.is_admin());

CREATE POLICY "rfq_attachments_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'rfq-attachments' AND public.is_admin())
WITH CHECK (bucket_id = 'rfq-attachments' AND public.is_admin());

CREATE POLICY "rfq_attachments_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'rfq-attachments' AND public.is_admin());

-- 2. Remove anon insert on rfq_portal_requests (edge functions use service role)
DROP POLICY IF EXISTS "Anon can insert rfq_portal_requests" ON public.rfq_portal_requests;

-- 3. Scope service-role email policies to the service_role only (not public)
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read send log" ON public.email_send_log FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can update send log" ON public.email_send_log FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails FOR SELECT TO service_role USING (true);
