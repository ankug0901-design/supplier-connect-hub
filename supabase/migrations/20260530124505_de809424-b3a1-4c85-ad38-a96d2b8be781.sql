-- 1) Realtime: remove permissive broadcast SELECT policy
DROP POLICY IF EXISTS "Authenticated users can receive broadcasts" ON realtime.messages;

-- 2) Storage: replace email-claim-based ownership with supplier-row-based ownership
DROP POLICY IF EXISTS "Suppliers read own documents or admins read all" ON storage.objects;
DROP POLICY IF EXISTS "Suppliers upload to own folder or admins anywhere" ON storage.objects;

CREATE POLICY "Suppliers read own documents or admins read all"
ON storage.objects
FOR SELECT
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

CREATE POLICY "Suppliers upload to own folder or admins anywhere"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'supplier-documents'
  AND (
    public.is_admin()
    OR (storage.foldername(name))[2] IN (
      SELECT s.email FROM public.suppliers s WHERE s.user_id = auth.uid()
    )
  )
);