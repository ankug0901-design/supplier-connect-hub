INSERT INTO public.app_roles (role, label, is_system)
VALUES ('tracker_admin', 'Tracker Admin', false)
ON CONFLICT (role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_tracker_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE user_id = auth.uid() AND role = 'tracker_admin'
  );
$$;

CREATE POLICY "Tracker admins read POs"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.is_tracker_admin());

CREATE POLICY "Tracker admins read po_items"
  ON public.po_items FOR SELECT TO authenticated
  USING (public.is_tracker_admin());

CREATE POLICY "Tracker admins read client_orders"
  ON public.client_orders FOR SELECT TO authenticated
  USING (public.is_tracker_admin());

CREATE POLICY "Tracker admins read production_updates"
  ON public.po_production_updates FOR SELECT TO authenticated
  USING (public.is_tracker_admin());

CREATE POLICY "Tracker admins insert production_updates"
  ON public.po_production_updates FOR INSERT TO authenticated
  WITH CHECK (public.is_tracker_admin());

CREATE POLICY "Tracker admins read suppliers"
  ON public.suppliers FOR SELECT TO authenticated
  USING (public.is_tracker_admin());