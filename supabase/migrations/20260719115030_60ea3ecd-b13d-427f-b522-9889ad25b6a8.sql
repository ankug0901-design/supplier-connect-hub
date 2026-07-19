-- Restrict writes to the public 'template' bucket to admins only. Public read remains
-- via the bucket's public flag; admins are the only ones who can add/change/remove files.
DROP POLICY IF EXISTS "template_bucket_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "template_bucket_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "template_bucket_admin_delete" ON storage.objects;

CREATE POLICY "template_bucket_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'template' AND public.is_admin());

CREATE POLICY "template_bucket_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'template' AND public.is_admin())
  WITH CHECK (bucket_id = 'template' AND public.is_admin());

CREATE POLICY "template_bucket_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'template' AND public.is_admin());