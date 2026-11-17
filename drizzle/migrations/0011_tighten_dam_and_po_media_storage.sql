DROP POLICY IF EXISTS "temp_anon_upload_po_media" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_upload_dam" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_dam" ON storage.objects;

CREATE POLICY "dam_upload_admin_or_own_ticket_file" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dam-assets' AND (
    public.is_admin() OR public.is_tracker_admin()
    OR ((storage.foldername(name))[1] = 'tickets' AND owner_id = (select auth.uid()::text))
  )
);

CREATE POLICY "dam_read_admin_owner_or_visible_ticket" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'dam-assets' AND (
    public.is_admin() OR public.is_tracker_admin()
    OR owner_id = (select auth.uid()::text)
    OR ((storage.foldername(name))[1] = 'tickets' AND (
      EXISTS (SELECT 1 FROM public.tickets t WHERE t.attachments::text LIKE '%' || storage.objects.name || '%')
      OR EXISTS (SELECT 1 FROM public.ticket_comments c WHERE c.attachments::text LIKE '%' || storage.objects.name || '%')
    ))
  )
);