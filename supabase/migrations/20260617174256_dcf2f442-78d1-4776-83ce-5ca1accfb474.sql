
-- Storage: DELETE & UPDATE policies for supplier-documents mirroring the SELECT policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'Suppliers update own documents or admins update all'
  ) THEN
    CREATE POLICY "Suppliers update own documents or admins update all"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'supplier-documents'
        AND (
          public.is_admin()
          OR (storage.foldername(name))[2] IN (
            SELECT s.email FROM public.suppliers s WHERE s.user_id = auth.uid()
          )
        )
      )
      WITH CHECK (
        bucket_id = 'supplier-documents'
        AND (
          public.is_admin()
          OR (storage.foldername(name))[2] IN (
            SELECT s.email FROM public.suppliers s WHERE s.user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'Suppliers delete own documents or admins delete all'
  ) THEN
    CREATE POLICY "Suppliers delete own documents or admins delete all"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'supplier-documents'
        AND (
          public.is_admin()
          OR (storage.foldername(name))[2] IN (
            SELECT s.email FROM public.suppliers s WHERE s.user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- supplier_registrations: allow suppliers to update their own row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.supplier_registrations'::regclass
      AND polname = 'Suppliers can update own registration'
  ) THEN
    CREATE POLICY "Suppliers can update own registration"
      ON public.supplier_registrations
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
