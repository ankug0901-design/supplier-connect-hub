CREATE POLICY "RFQ attachments authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rfq-attachments');

CREATE POLICY "RFQ attachments authenticated reads" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rfq-attachments');

CREATE POLICY "RFQ attachments authenticated updates" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'rfq-attachments');