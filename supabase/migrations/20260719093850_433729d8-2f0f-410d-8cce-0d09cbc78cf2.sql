
CREATE POLICY "rfq_attachments_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'rfq-attachments');

CREATE POLICY "rfq_attachments_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'rfq-attachments');

CREATE POLICY "rfq_attachments_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'rfq-attachments')
WITH CHECK (bucket_id = 'rfq-attachments');

CREATE POLICY "rfq_attachments_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'rfq-attachments');
