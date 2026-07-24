-- rfq-boq-templates: allow authenticated uploads and reads
CREATE POLICY "BOQ templates authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rfq-boq-templates');

CREATE POLICY "BOQ templates authenticated reads" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rfq-boq-templates');

-- rfq-boq-responses: allow authenticated uploads and reads
CREATE POLICY "BOQ responses authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rfq-boq-responses');

CREATE POLICY "BOQ responses authenticated reads" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rfq-boq-responses');