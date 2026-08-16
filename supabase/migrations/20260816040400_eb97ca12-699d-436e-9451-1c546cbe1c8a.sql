-- 1. rfq_documents: remove public read, scope to admin + owning supplier
DROP POLICY IF EXISTS "rfq_documents_select" ON public.rfq_documents;
DROP POLICY IF EXISTS "rfq_documents_insert_service" ON public.rfq_documents;
DROP POLICY IF EXISTS "rfq_documents_delete_service" ON public.rfq_documents;

REVOKE ALL ON public.rfq_documents FROM anon;
GRANT SELECT ON public.rfq_documents TO authenticated;
GRANT ALL ON public.rfq_documents TO service_role;

CREATE POLICY "rfq_documents_admin_select" ON public.rfq_documents
FOR SELECT TO authenticated
USING (public.is_admin() OR public.has_section_access('admin-rfq'));

CREATE POLICY "rfq_documents_supplier_select" ON public.rfq_documents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rfq_portal_requests r
  JOIN public.suppliers s ON s.id = r.supplier_id
  WHERE r.rfq_id = rfq_documents.rfq_id AND s.user_id = auth.uid()
));

-- 2. Convert every remaining 'public'-role policy in the public schema to 'authenticated'
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND roles::text[] = ARRAY['public']
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 3. Revoke anon data-API access on sensitive tables (public tracking uses SECURITY DEFINER RPCs)
REVOKE ALL ON public.client_orders FROM anon;
REVOKE ALL ON public.po_dispatch FROM anon;
REVOKE ALL ON public.po_production_updates FROM anon;
REVOKE ALL ON public.three_way_matches FROM anon;
REVOKE ALL ON public.rfq_portal_requests FROM anon;
REVOKE ALL ON public.rfq_items FROM anon;
REVOKE ALL ON public.rfq_item_quotes FROM anon;

-- 4. Disable realtime on sensitive tables
ALTER PUBLICATION supabase_realtime DROP TABLE public.three_way_matches;
ALTER PUBLICATION supabase_realtime DROP TABLE public.rfq_documents;

-- 5. Pin search_path on the remaining SECURITY DEFINER function
ALTER FUNCTION public.auto_create_client_order_from_3wm() SET search_path = public;