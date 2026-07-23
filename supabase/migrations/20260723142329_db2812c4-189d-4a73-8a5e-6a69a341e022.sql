
-- rfq-boq-templates: authenticated read, admin write
CREATE POLICY "boq_templates_auth_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rfq-boq-templates');

CREATE POLICY "boq_templates_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rfq-boq-templates' AND public.is_admin());

CREATE POLICY "boq_templates_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rfq-boq-templates' AND public.is_admin())
  WITH CHECK (bucket_id = 'rfq-boq-templates' AND public.is_admin());

CREATE POLICY "boq_templates_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rfq-boq-templates' AND public.is_admin());

-- rfq-boq-responses: supplier writes/reads own folder (2nd path segment = their email);
-- admins can do anything.
CREATE POLICY "boq_responses_supplier_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rfq-boq-responses' AND (
      public.is_admin() OR
      lower((storage.foldername(name))[2]) = lower((auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "boq_responses_supplier_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rfq-boq-responses' AND (
      public.is_admin() OR
      lower((storage.foldername(name))[2]) = lower((auth.jwt() ->> 'email'))
    )
  )
  WITH CHECK (
    bucket_id = 'rfq-boq-responses' AND (
      public.is_admin() OR
      lower((storage.foldername(name))[2]) = lower((auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "boq_responses_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rfq-boq-responses' AND (
      public.is_admin() OR
      lower((storage.foldername(name))[2]) = lower((auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "boq_responses_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rfq-boq-responses' AND public.is_admin());
