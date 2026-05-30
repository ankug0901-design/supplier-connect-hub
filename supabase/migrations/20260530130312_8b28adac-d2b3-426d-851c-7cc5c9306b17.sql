CREATE TABLE public.role_section_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  section_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, section_key)
);

GRANT SELECT ON public.role_section_access TO authenticated;
GRANT ALL ON public.role_section_access TO service_role;

ALTER TABLE public.role_section_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read role section access"
  ON public.role_section_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage role section access"
  ON public.role_section_access FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE TRIGGER trg_role_section_access_updated
  BEFORE UPDATE ON public.role_section_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed all supplier sections enabled
INSERT INTO public.role_section_access (role, section_key, enabled) VALUES
  ('supplier', 'dashboard', true),
  ('supplier', 'rfq-requests', true),
  ('supplier', 'purchase-orders', true),
  ('supplier', 'invoices', true),
  ('supplier', 'payments', true),
  ('supplier', 'delivery-challan', true),
  ('supplier', 'shipments', true)
ON CONFLICT (role, section_key) DO NOTHING;