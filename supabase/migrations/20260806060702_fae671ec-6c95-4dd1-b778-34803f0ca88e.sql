CREATE POLICY "po_tracker_media_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'po-tracker-media');
CREATE POLICY "po_tracker_media_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'po-tracker-media') WITH CHECK (bucket_id = 'po-tracker-media');

INSERT INTO public.role_section_access (role, section_key, enabled)
SELECT r.role, 'production', true FROM (SELECT DISTINCT role FROM public.role_section_access) r
ON CONFLICT DO NOTHING;