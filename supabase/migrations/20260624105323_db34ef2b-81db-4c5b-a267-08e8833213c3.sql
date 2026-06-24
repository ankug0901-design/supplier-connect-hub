
-- 1. Fix is_super_admin() to match documented model: super_user is the top tier
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE user_id = auth.uid() AND role = 'super_user'
  );
$function$;

-- 2. Attach trigger that prevents non-admins from updating admin-controlled RFQ fields
DROP TRIGGER IF EXISTS trg_prevent_rfq_admin_field_update ON public.rfq_portal_requests;
CREATE TRIGGER trg_prevent_rfq_admin_field_update
BEFORE UPDATE ON public.rfq_portal_requests
FOR EACH ROW
EXECUTE FUNCTION public.prevent_rfq_admin_field_update();

-- 3. Allow suppliers to read their own three-way match rows (needed for Realtime + UI)
DROP POLICY IF EXISTS "Suppliers can view own three_way_matches" ON public.three_way_matches;
CREATE POLICY "Suppliers can view own three_way_matches"
ON public.three_way_matches
FOR SELECT
TO authenticated
USING (
  supplier_id IN (
    SELECT id FROM public.suppliers WHERE user_id = auth.uid()
  )
);
