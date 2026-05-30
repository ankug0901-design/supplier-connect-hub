CREATE TABLE public.supplier_section_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  section_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, section_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_section_access TO authenticated;
GRANT ALL ON public.supplier_section_access TO service_role;

ALTER TABLE public.supplier_section_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all section access"
ON public.supplier_section_access
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users view their own section access"
ON public.supplier_section_access
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_supplier_section_access_updated_at
BEFORE UPDATE ON public.supplier_section_access
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_supplier_section_access_user ON public.supplier_section_access(user_id);