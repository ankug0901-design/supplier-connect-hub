DROP POLICY IF EXISTS "po_tracker_media_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload po-tracker-media" ON storage.objects;
DROP POLICY IF EXISTS "po_tracker_media_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "po_tracker_media_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "po_tracker_media_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "po_tracker_media_owner_delete" ON storage.objects;

CREATE OR REPLACE FUNCTION public.can_write_po_media(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR public.is_tracker_admin()
      OR EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        JOIN public.suppliers s ON s.id = po.supplier_id
        WHERE s.user_id = auth.uid()
          AND po.id::text = (storage.foldername(_object_name))[1]
      );
$$;

CREATE POLICY "po_tracker_media_owner_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'po-tracker-media' AND public.can_write_po_media(name));

CREATE POLICY "po_tracker_media_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'po-tracker-media' AND public.can_write_po_media(name))
WITH CHECK (bucket_id = 'po-tracker-media' AND public.can_write_po_media(name));

CREATE POLICY "po_tracker_media_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'po-tracker-media' AND public.can_write_po_media(name));