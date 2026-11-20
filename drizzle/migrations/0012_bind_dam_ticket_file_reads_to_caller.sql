DROP POLICY IF EXISTS dam_read_admin_owner_or_visible_ticket ON storage.objects;
CREATE POLICY dam_read_admin_owner_or_visible_ticket ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'dam-assets' AND (
    public.is_admin() OR public.is_tracker_admin()
    OR owner_id = (SELECT auth.uid()::text)
    OR (
      (storage.foldername(name))[1] = 'tickets' AND EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE (t.created_by = (SELECT auth.uid())
               OR t.supplier_id IN (SELECT s.id FROM public.suppliers s WHERE s.user_id = (SELECT auth.uid()))
               OR t.linked_supplier_id IN (SELECT s.id FROM public.suppliers s WHERE s.user_id = (SELECT auth.uid())))
          AND (
            t.attachments::text LIKE '%' || objects.name || '%'
            OR EXISTS (SELECT 1 FROM public.ticket_comments c
                       WHERE c.ticket_id = t.id AND c.is_internal IS NOT TRUE
                         AND c.attachments::text LIKE '%' || objects.name || '%')
          )
      )
    )
  )
);