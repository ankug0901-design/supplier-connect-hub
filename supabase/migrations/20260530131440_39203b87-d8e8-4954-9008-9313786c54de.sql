
-- Introduce 'super_user' tier: same access as admin EXCEPT page permissions and role management.
-- is_admin() now returns true for both 'admin' and 'super_user' so they share admin UI/data access.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_user')
  );
$$;

-- New helper: true only for the top-tier 'admin' role.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Only top-tier admin can change roles (super_users cannot escalate themselves or others).
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_super_admin() THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure trigger exists on suppliers (no-op if already attached).
DROP TRIGGER IF EXISTS prevent_role_escalation_trg ON public.suppliers;
CREATE TRIGGER prevent_role_escalation_trg
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- Restrict Page Permissions management to top-tier admin only.
DROP POLICY IF EXISTS "Admins manage role section access" ON public.role_section_access;
CREATE POLICY "Super admins manage role section access"
ON public.role_section_access
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());
