INSERT INTO public.role_section_access (role, section_key, enabled)
SELECT r.role, v.section_key,
  CASE
    WHEN r.role = 'admin' THEN true
    WHEN v.section_key = 'production' AND r.role = 'supplier' THEN true
    ELSE false
  END
FROM public.app_roles r
CROSS JOIN (VALUES ('admin-po-tracker'), ('production')) AS v(section_key)
ON CONFLICT (role, section_key) DO NOTHING;