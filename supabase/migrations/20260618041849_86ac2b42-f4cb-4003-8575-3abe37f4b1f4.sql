
-- 1) Include 'user' role in admin layout access
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_user', 'user')
  );
$$;

-- 2) Table cataloguing all roles (system + custom)
CREATE TABLE IF NOT EXISTS public.app_roles (
  role text PRIMARY KEY,
  label text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_roles TO authenticated;
GRANT ALL ON public.app_roles TO service_role;

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view roles" ON public.app_roles;
CREATE POLICY "Authenticated can view roles"
  ON public.app_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admin manages roles" ON public.app_roles;
CREATE POLICY "Super admin manages roles"
  ON public.app_roles FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

INSERT INTO public.app_roles (role, label, is_system) VALUES
  ('admin', 'Admin', true),
  ('super_user', 'Super User', true),
  ('user', 'User', false),
  ('supplier', 'Supplier', true)
ON CONFLICT (role) DO NOTHING;

-- 3) Seed sensible defaults for the new 'user' role
-- Admin sections OFF by default
INSERT INTO public.role_section_access (role, section_key, enabled) VALUES
  ('user', 'admin-dashboard', false),
  ('user', 'admin-suppliers', false),
  ('user', 'admin-registrations', false),
  ('user', 'admin-rfq', false),
  ('user', 'admin-three-way-match', false),
  ('user', 'admin-ai-insights', false),
  ('user', 'admin-vendor-scores', false)
ON CONFLICT (role, section_key) DO NOTHING;

-- Supplier-view sections ON by default
INSERT INTO public.role_section_access (role, section_key, enabled) VALUES
  ('user', 'dashboard', true),
  ('user', 'rfq-requests', true),
  ('user', 'purchase-orders', true),
  ('user', 'invoices', true),
  ('user', 'payments', true),
  ('user', 'delivery-challan', true),
  ('user', 'shipments', true)
ON CONFLICT (role, section_key) DO NOTHING;

-- Same defaults for 'super_user' (admin sections enabled, supplier sections enabled) — only insert if missing so existing toggles are preserved
INSERT INTO public.role_section_access (role, section_key, enabled) VALUES
  ('super_user', 'admin-dashboard', true),
  ('super_user', 'admin-suppliers', true),
  ('super_user', 'admin-registrations', true),
  ('super_user', 'admin-rfq', true),
  ('super_user', 'admin-three-way-match', true),
  ('super_user', 'admin-ai-insights', true),
  ('super_user', 'admin-vendor-scores', true),
  ('super_user', 'dashboard', true),
  ('super_user', 'rfq-requests', true),
  ('super_user', 'purchase-orders', true),
  ('super_user', 'invoices', true),
  ('super_user', 'payments', true),
  ('super_user', 'delivery-challan', true),
  ('super_user', 'shipments', true)
ON CONFLICT (role, section_key) DO NOTHING;
